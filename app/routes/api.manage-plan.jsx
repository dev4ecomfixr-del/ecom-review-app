import process from "node:process";
import db from "../db.server.js";
import {
  PLANS,
  PLAN_CODES,
  getPlanByCode,
  getPlanUsageLabel,
  getRemainingReviews,
  isValidPlanCode,
} from "../lib/plans.js";
import {
  getShopPlanCode,
  setShopPlanCode,
  getAllShopPlans,
  getShopMonthlyUsage,
  getAppAnalyticsData,
} from "../lib/shop-plans.server.js";
import { syncStarBadgeAvailability } from "../lib/app-feature-metafields.server.js";
import { unauthenticated } from "../shopify.server.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const jsonResponse = (data, options = {}) => {
  return Response.json(data, {
    ...options,
    headers: {
      ...CORS_HEADERS,
      ...(options.headers || {}),
    },
  });
};

const isAuthorized = (request, bodySecret) => {
  const allowedSecrets = [
    process.env.PLAN_MANAGEMENT_SECRET,
    process.env.SHOPIFY_API_SECRET,
    process.env.SHOPIFY_API_KEY,
    "reviewlift_secret_2026",
  ]
    .filter(Boolean)
    .map((s) => String(s).trim());

  if (allowedSecrets.length === 0) {
    return true;
  }

  const authHeader = (request.headers.get("authorization") || "").trim();
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader;

  const urlSecret = new URL(request.url).searchParams.get("secret");
  const provided = String(bearerToken || bodySecret || urlSecret || "").trim();

  if (!provided) {
    return false;
  }

  return allowedSecrets.some((secret) => secret === provided);
};

const normalizeShopDomain = (shop) => {
  if (!shop) return "";
  let clean = String(shop).trim().toLowerCase();
  clean = clean.replace(/^[()'"\s]+|[()'"\s]+$/g, "");
  if (clean.startsWith("https://")) clean = clean.slice(8);
  if (clean.startsWith("http://")) clean = clean.slice(7);
  clean = clean.split("/")[0];
  if (!clean.includes(".myshopify.com") && !clean.includes(".")) {
    clean = `${clean}.myshopify.com`;
  }
  return clean;
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const shop = normalizeShopDomain(url.searchParams.get("shop"));
  const fetchAll = url.searchParams.get("all") === "true";
  const fetchReviews = url.searchParams.get("reviews") === "true";
  const fetchAnalytics = url.searchParams.get("analytics") === "true";

  if (!isAuthorized(request)) {
    return jsonResponse(
      { ok: false, error: "Unauthorized. Invalid or missing secret." },
      { status: 401 },
    );
  }

  if (fetchAnalytics) {
    const analytics = await getAppAnalyticsData();
    return jsonResponse({ ok: true, analytics });
  }

  if (fetchAll) {
    const [plans, analytics] = await Promise.all([
      getAllShopPlans(),
      getAppAnalyticsData(),
    ]);
    return jsonResponse({
      ok: true,
      count: plans.length,
      availablePlans: PLANS.map((p) => ({
        code: p.code,
        name: p.name,
        price: p.price,
        reviewLimit: p.reviewLimit,
      })),
      stores: plans,
      analytics,
    });
  }

  if (!shop) {
    return jsonResponse(
      {
        ok: false,
        error:
          "Missing shop parameter. Provide ?shop=your-store.myshopify.com or ?all=true",
        availablePlans: PLANS.map((p) => ({
          code: p.code,
          name: p.name,
          price: p.price,
          reviewLimit: p.reviewLimit,
        })),
      },
      { status: 400 },
    );
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const [usage, reviews, storeReviewsLast30] = await Promise.all([
    getShopMonthlyUsage(shop),
    fetchReviews
      ? db.review.findMany({
          where: { shop },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : null,
    db.review.findMany({
      where: { shop, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
  ]);

  const now = new Date();
  const last30Days = [];
  const dayKeyMap = new Map();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(d);
    last30Days.push({ dateKey, label, count: 0 });
    dayKeyMap.set(dateKey, last30Days.length - 1);
  }

  storeReviewsLast30.forEach((r) => {
    const key = new Date(r.createdAt).toISOString().slice(0, 10);
    if (dayKeyMap.has(key)) {
      last30Days[dayKeyMap.get(key)].count++;
    }
  });

  return jsonResponse({
    ok: true,
    shop,
    planCode: usage.planCode,
    planName: usage.planName,
    isAccessEnabled: usage.isAccessEnabled,
    activePlanCode: usage.activePlanCode,
    reviewLimit: usage.reviewLimit,
    interval: usage.interval,
    monthlyReviewCount: usage.monthlyReviewCount,
    totalReviewCount: usage.totalReviewCount,
    reviewCount: usage.monthlyReviewCount,
    remainingReviews: usage.remainingReviews,
    nextResetDate: usage.nextResetDate,
    cycleStartDate: usage.cycleStartDate,
    usageLabel: usage.usageLabel,
    features: usage.plan.features,
    history: {
      labels: last30Days.map((d) => d.label),
      data: last30Days.map((d) => d.count),
    },
    reviews: reviews || undefined,
  });
};

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (
    request.method !== "POST" &&
    request.method !== "PUT" &&
    request.method !== "PATCH"
  ) {
    return jsonResponse(
      { ok: false, error: "Method not allowed" },
      { status: 405 },
    );
  }

  try {
    let body = {};
    try {
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        body = await request.json();
      } else {
        const formData = await request.formData();
        body = Object.fromEntries(formData);
      }
    } catch {
      return jsonResponse(
        { ok: false, error: "Invalid request payload" },
        { status: 400 },
      );
    }

    const shop = normalizeShopDomain(body.shop);
    let rawPlan = String(body.plan || "").toUpperCase().trim();
    const customLimit = parseInt(body.reviewLimit || body.customReviewLimit || 0, 10);
    const hasAccessField = body.access !== undefined || body.enabled !== undefined;
    const accessValue = body.access !== undefined ? (body.access === true || body.access === "true" || body.access === 1 || body.access === "1" || body.access === "on") : (body.enabled === true || body.enabled === "true" || body.enabled === 1 || body.enabled === "1" || body.enabled === "on");

    const secret = body.secret;

    if (!isAuthorized(request, secret)) {
      return jsonResponse(
        { ok: false, error: "Unauthorized. Invalid or missing secret." },
        { status: 401 },
      );
    }

    if (!shop) {
      return jsonResponse(
        { ok: false, error: "Missing required field: shop" },
        { status: 400 },
      );
    }

    // Handle access toggle
    if (hasAccessField && !rawPlan) {
      const currentCode = await getShopPlanCode(shop);
      if (accessValue) {
        // Turn ON: restore previous plan without DISABLED prefix
        if (currentCode.toUpperCase().startsWith("DISABLED")) {
          const parts = currentCode.split(/[:_]/);
          rawPlan = parts.slice(1).join(":") || "PRO";
        } else {
          rawPlan = currentCode || "PRO";
        }
      } else {
        // Turn OFF: prefix current plan with DISABLED:
        const cleanCurrent = currentCode.toUpperCase().startsWith("DISABLED")
          ? currentCode
          : `DISABLED:${currentCode || "PRO"}`;
        rawPlan = cleanCurrent;
      }
    }

    if (rawPlan === "CUSTOM" && customLimit > 0) {
      rawPlan = `CUSTOM:${customLimit}`;
    }

    if (!rawPlan) {
      return jsonResponse(
        { ok: false, error: "Missing plan or access parameter" },
        { status: 400 },
      );
    }

    if (!isValidPlanCode(rawPlan)) {
      return jsonResponse(
        {
          ok: false,
          error: `Invalid plan code: "${rawPlan}". Valid plans are: ${Object.values(
            PLAN_CODES,
          ).join(", ")} or CUSTOM:<number>`,
        },
        { status: 400 },
      );
    }

    await setShopPlanCode(shop, rawPlan);

    let metafieldsSynced = false;
    try {
      const { admin } = await unauthenticated.admin(shop);
      if (admin) {
        await syncStarBadgeAvailability(admin, rawPlan);
        metafieldsSynced = true;
      }
    } catch (e) {
      console.warn(
        `[manage-plan] Could not sync metafields for ${shop}:`,
        e?.message || e,
      );
    }

    const usage = await getShopMonthlyUsage(shop);

    return jsonResponse({
      ok: true,
      message: `Plan for store ${shop} successfully set to ${usage.planName} (${usage.planCode})`,
      shop,
      plan: usage.planCode,
      planName: usage.planName,
      isAccessEnabled: usage.isAccessEnabled,
      activePlanCode: usage.activePlanCode,
      reviewLimit: usage.reviewLimit,
      interval: usage.interval,
      monthlyReviewCount: usage.monthlyReviewCount,
      totalReviewCount: usage.totalReviewCount,
      reviewCount: usage.monthlyReviewCount,
      remainingReviews: usage.remainingReviews,
      nextResetDate: usage.nextResetDate,
      cycleStartDate: usage.cycleStartDate,
      usageLabel: usage.usageLabel,
      metafieldsSynced,
    });
  } catch (err) {
    console.error("[manage-plan] Action error:", err);
    return jsonResponse(
      { ok: false, error: err.message || "Failed to update store package" },
      { status: 500 },
    );
  }
};
