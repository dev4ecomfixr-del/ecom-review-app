import db from "../db.server.js";
import {
  DEFAULT_PLAN,
  getPlanByCode,
  getRemainingReviews,
  getPlanUsageLabel,
  getBillingCycleWindow,
} from "./plans.js";

export const getShopPlanCode = async (shop) => {
  if (db.shopPlan) {
    const shopPlan = await db.shopPlan.findUnique({ where: { shop } });
    return shopPlan?.plan || DEFAULT_PLAN.code;
  }

  const rows = await db.$queryRaw`
    SELECT plan FROM ShopPlan WHERE shop = ${shop} LIMIT 1
  `;

  return rows[0]?.plan || DEFAULT_PLAN.code;
};

export const setShopPlanCode = async (shop, plan) => {
  if (db.shopPlan) {
    await db.shopPlan.upsert({
      where: { shop },
      create: { shop, plan },
      update: { plan },
    });
    return;
  }

  await db.$executeRaw`
    INSERT INTO ShopPlan (shop, plan, createdAt, updatedAt)
    VALUES (${shop}, ${plan}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(shop) DO UPDATE SET
      plan = ${plan},
      updatedAt = CURRENT_TIMESTAMP
  `;
};

export const getShopMonthlyUsage = async (shop) => {
  const shopPlanRecord = db.shopPlan
    ? await db.shopPlan.findUnique({ where: { shop } })
    : null;

  const planCode = shopPlanRecord?.plan || DEFAULT_PLAN.code;
  const plan = getPlanByCode(planCode);
  const cycleWindow = getBillingCycleWindow(
    shopPlanRecord?.createdAt || shopPlanRecord?.updatedAt,
  );

  const [monthlyReviewCount, totalReviewCount] = await Promise.all([
    db.review
      ? db.review.count({
          where: {
            shop,
            createdAt: { gte: cycleWindow.cycleStart },
          },
        })
      : 0,
    db.review ? db.review.count({ where: { shop } }) : 0,
  ]);

  const remainingReviews = getRemainingReviews(plan, monthlyReviewCount);

  return {
    shop,
    plan,
    planCode: plan.code,
    planName: plan.name,
    isAccessEnabled: plan.isAccessEnabled !== false,
    activePlanCode: plan.activePlanCode || plan.code,
    reviewLimit: plan.reviewLimit,
    interval: "MONTHLY",
    monthlyReviewCount,
    totalReviewCount,
    remainingReviews,
    cycleStart: cycleWindow.cycleStart,
    cycleEnd: cycleWindow.cycleEnd,
    nextResetDate: cycleWindow.nextResetFormatted,
    cycleStartDate: cycleWindow.cycleStartFormatted,
    usageLabel: getPlanUsageLabel(
      plan,
      monthlyReviewCount,
      cycleWindow.nextResetFormatted,
    ),
  };
};

export const getAllShopPlans = async () => {
  const [sessions, shopPlans, reviewCounts] = await Promise.all([
    db.session ? db.session.findMany({ select: { shop: true } }) : [],
    db.shopPlan ? db.shopPlan.findMany() : [],
    db.review ? db.review.groupBy({ by: ["shop"], _count: { id: true } }) : [],
  ]);

  const planMap = new Map();
  shopPlans.forEach((sp) => planMap.set(sp.shop, sp));

  const reviewMap = new Map();
  reviewCounts.forEach((rc) => reviewMap.set(rc.shop, rc._count.id));

  const allShopDomains = new Set([
    ...sessions.map((s) => s.shop),
    ...shopPlans.map((sp) => sp.shop),
    ...reviewCounts.map((rc) => rc.shop),
  ]);

  const now = new Date();

  const results = await Promise.all(
    Array.from(allShopDomains)
      .filter(Boolean)
      .map(async (shop) => {
        const planRecord = planMap.get(shop);
        const planCode = planRecord?.plan || DEFAULT_PLAN.code;
        const plan = getPlanByCode(planCode);
        const cycleWindow = getBillingCycleWindow(
          planRecord?.createdAt || planRecord?.updatedAt,
        );

        let monthlyCount = 0;
        try {
          monthlyCount = await db.review.count({
            where: { shop, createdAt: { gte: cycleWindow.cycleStart } },
          });
        } catch {
          monthlyCount = reviewMap.get(shop) || 0;
        }

        const totalReviewCount = reviewMap.get(shop) || 0;
        const remainingReviews = getRemainingReviews(plan, monthlyCount);

        return {
          shop,
          plan: plan.code,
          planName: plan.name,
          isAccessEnabled: plan.isAccessEnabled !== false,
          activePlanCode: plan.activePlanCode || plan.code,
          reviewLimit: plan.reviewLimit,
          interval: "MONTHLY",
          monthlyReviewCount: monthlyCount,
          totalReviewCount,
          reviewCount: monthlyCount,
          remainingReviews,
          nextResetDate: cycleWindow.nextResetFormatted,
          cycleStartDate: cycleWindow.cycleStartFormatted,
          usageLabel: getPlanUsageLabel(
            plan,
            monthlyCount,
            cycleWindow.nextResetFormatted,
          ),
          createdAt: planRecord?.createdAt || null,
          updatedAt: planRecord?.updatedAt || null,
        };
      }),
  );

  return results;
};

export const getAppAnalyticsData = async () => {
  const now = new Date();

  // 1. Last 30 Days (Daily)
  const last30Days = [];
  const dayKeyMap = new Map();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(d);
    last30Days.push({ dateKey, label, count: 0 });
    dayKeyMap.set(dateKey, last30Days.length - 1);
  }

  // 2. Last 12 Months (Monthly)
  const last12Months = [];
  const monthKeyMap = new Map();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(d);
    last12Months.push({ monthKey, label, reviewsCount: 0, storesCount: 0 });
    monthKeyMap.set(monthKey, last12Months.length - 1);
  }

  const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0);
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0);

  const [reviews30Days, reviews12Months, allShopPlans, totalReviewsCount] = await Promise.all([
    db.review
      ? db.review.findMany({
          where: { createdAt: { gte: thirtyDaysAgo } },
          select: { createdAt: true },
        })
      : [],
    db.review
      ? db.review.findMany({
          where: { createdAt: { gte: twelveMonthsAgo } },
          select: { createdAt: true },
        })
      : [],
    db.shopPlan
      ? db.shopPlan.findMany({
          select: { shop: true, plan: true, createdAt: true },
        })
      : [],
    db.review ? db.review.count() : 0,
  ]);

  reviews30Days.forEach((r) => {
    const key = new Date(r.createdAt).toISOString().slice(0, 10);
    if (dayKeyMap.has(key)) {
      last30Days[dayKeyMap.get(key)].count++;
    }
  });

  reviews12Months.forEach((r) => {
    const d = new Date(r.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthKeyMap.has(key)) {
      last12Months[monthKeyMap.get(key)].reviewsCount++;
    }
  });

  allShopPlans.forEach((sp) => {
    const d = sp.createdAt ? new Date(sp.createdAt) : now;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthKeyMap.has(key)) {
      last12Months[monthKeyMap.get(key)].storesCount++;
    }
  });

  const totalStores = allShopPlans.length;
  const activeStores = allShopPlans.filter(
    (s) => !String(s.plan || "").toUpperCase().startsWith("DISABLED"),
  ).length;
  const customQuotaStores = allShopPlans.filter((s) =>
    String(s.plan || "")
      .toUpperCase()
      .replace(/^DISABLED:/, "")
      .startsWith("CUSTOM"),
  ).length;

  return {
    dailyReviews: {
      labels: last30Days.map((d) => d.label),
      data: last30Days.map((d) => d.count),
    },
    monthlyReviews: {
      labels: last12Months.map((m) => m.label),
      data: last12Months.map((m) => m.reviewsCount),
    },
    monthlyStores: {
      labels: last12Months.map((m) => m.label),
      data: last12Months.map((m) => m.storesCount),
      summary: {
        totalStores,
        activeStores,
        customQuotaStores,
        totalReviews: totalReviewsCount,
      },
    },
  };
};


