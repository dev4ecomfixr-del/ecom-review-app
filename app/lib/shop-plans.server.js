import db from "../db.server.js";
import { DEFAULT_PLAN } from "./plans.js";

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
