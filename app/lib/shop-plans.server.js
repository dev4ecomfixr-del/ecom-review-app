import db from "../db.server.js";
import { DEFAULT_PLAN, PLAN_CODES } from "./plans.js";

export const PAID_PLAN_CODES = [PLAN_CODES.GROWTH, PLAN_CODES.PRO];

const getActivePaidPlanCode = (appSubscriptions = []) => {
  const knownPaidPlans = new Set(PAID_PLAN_CODES);

  return appSubscriptions
    .slice()
    .sort((left, right) => {
      const leftCreatedAt = Date.parse(left.createdAt || "") || 0;
      const rightCreatedAt = Date.parse(right.createdAt || "") || 0;

      return rightCreatedAt - leftCreatedAt;
    })
    .map((subscription) => String(subscription.name || "").toUpperCase())
    .find((planCode) => knownPaidPlans.has(planCode));
};

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

/**
 * Treat Shopify's active subscriptions as the source of truth and keep the
 * local plan cache in sync for storefront requests that cannot use Admin API.
 */
export const syncShopPlanFromBilling = async ({ billing, shop }) => {
  // An unfiltered check includes active test and live subscriptions. This is
  // important for development/demo stores used during App Store review.
  const billingCheck = await billing.check();
  const activePaidPlanCode = getActivePaidPlanCode(
    billingCheck.appSubscriptions,
  );
  const planCode = activePaidPlanCode || DEFAULT_PLAN.code;
  const storedPlanCode = await getShopPlanCode(shop);

  if (storedPlanCode !== planCode) {
    await setShopPlanCode(shop, planCode);
  }

  return {
    appSubscriptions: billingCheck.appSubscriptions,
    planCode,
  };
};
