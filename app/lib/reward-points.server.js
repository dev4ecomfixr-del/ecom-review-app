import { randomInt } from "node:crypto";
import db from "../db.server.js";

export const DEFAULT_REWARD_POINT_SETTINGS = {
  enabled: true,
  pointsPerDollar: 1,
  minSpend: 0,
  pointUnitName: "Points",
  redemptionTiers: [
    { points: 100, type: "FIXED_AMOUNT", value: 5, label: "$5 off" },
    { points: 200, type: "FIXED_AMOUNT", value: 10, label: "$10 off" },
    { points: 500, type: "PERCENTAGE", value: 25, label: "25% off" },
  ],
  couponLifetimeDays: 30,
  codePrefix: "RP-",
};

const COUPON_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const generateRandomCode = (prefix = "RP-") => {
  let randomPart = "";
  for (let i = 0; i < 6; i += 1) {
    randomPart += COUPON_ALPHABET[randomInt(0, COUPON_ALPHABET.length)];
  }
  const cleanPrefix = String(prefix || "RP-").trim().toUpperCase();
  return `${cleanPrefix}${randomPart}`;
};

export const getRewardPointSettings = async (shop) => {
  if (!db.rewardPointSetting) {
    return { ...DEFAULT_REWARD_POINT_SETTINGS };
  }

  const record = await db.rewardPointSetting.findUnique({ where: { shop } });
  if (!record) {
    return { ...DEFAULT_REWARD_POINT_SETTINGS };
  }

  let redemptionTiers = DEFAULT_REWARD_POINT_SETTINGS.redemptionTiers;
  try {
    if (record.redemptionTiersJson) {
      const parsed = JSON.parse(record.redemptionTiersJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        redemptionTiers = parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to parse redemption tiers JSON:", e);
  }

  return {
    enabled: record.enabled ?? true,
    pointsPerDollar: record.pointsPerDollar ?? 1,
    minSpend: record.minSpend ?? 0,
    pointUnitName: record.pointUnitName || "Points",
    redemptionTiers,
    couponLifetimeDays: record.couponLifetimeDays ?? 30,
    codePrefix: record.codePrefix || "RP-",
  };
};

export const saveRewardPointSettings = async (shop, settings) => {
  if (!db.rewardPointSetting) return DEFAULT_REWARD_POINT_SETTINGS;

  const redemptionTiersJson = JSON.stringify(
    Array.isArray(settings.redemptionTiers) ? settings.redemptionTiers : DEFAULT_REWARD_POINT_SETTINGS.redemptionTiers,
  );

  const updated = await db.rewardPointSetting.upsert({
    where: { shop },
    create: {
      shop,
      enabled: Boolean(settings.enabled),
      pointsPerDollar: Math.max(1, Math.min(1000, Number(settings.pointsPerDollar) || 1)),
      minSpend: Math.max(0, Number(settings.minSpend) || 0),
      pointUnitName: String(settings.pointUnitName || "Points").trim().slice(0, 30),
      redemptionTiersJson,
      couponLifetimeDays: Math.max(1, Math.min(365, Number(settings.couponLifetimeDays) || 30)),
      codePrefix: String(settings.codePrefix || "RP-").trim().slice(0, 10).toUpperCase(),
    },
    update: {
      enabled: Boolean(settings.enabled),
      pointsPerDollar: Math.max(1, Math.min(1000, Number(settings.pointsPerDollar) || 1)),
      minSpend: Math.max(0, Number(settings.minSpend) || 0),
      pointUnitName: String(settings.pointUnitName || "Points").trim().slice(0, 30),
      redemptionTiersJson,
      couponLifetimeDays: Math.max(1, Math.min(365, Number(settings.couponLifetimeDays) || 30)),
      codePrefix: String(settings.codePrefix || "RP-").trim().slice(0, 10).toUpperCase(),
    },
  });

  return getRewardPointSettings(shop);
};

export const awardPointsForOrder = async (shop, orderPayload) => {
  if (!db.customerPointAccount || !orderPayload) {
    return { awarded: false, reason: "Database not ready or invalid payload" };
  }

  const settings = await getRewardPointSettings(shop);
  if (!settings.enabled) {
    return { awarded: false, reason: "Reward points system is disabled" };
  }

  const customerEmail = String(
    orderPayload.email ||
    orderPayload.contact_email ||
    orderPayload.customer?.email ||
    ""
  ).trim().toLowerCase();

  if (!customerEmail) {
    return { awarded: false, reason: "No customer email found on order" };
  }

  const customerName = [
    orderPayload.customer?.first_name || orderPayload.billing_address?.first_name || "",
    orderPayload.customer?.last_name || orderPayload.billing_address?.last_name || "",
  ].filter(Boolean).join(" ").trim() || (orderPayload.customer?.default_address?.name || "Customer");

  const orderSpend = Number(
    orderPayload.total_price ||
    orderPayload.current_total_price ||
    orderPayload.subtotal_price ||
    0
  );

  if (settings.minSpend > 0 && orderSpend < settings.minSpend) {
    return { awarded: false, reason: `Order total $${orderSpend} is below minimum spend $${settings.minSpend}` };
  }

  const pointsToAward = Math.floor(orderSpend * settings.pointsPerDollar);
  if (pointsToAward <= 0) {
    return { awarded: false, reason: "Zero points earned for this order amount" };
  }

  const orderId = String(orderPayload.id || "");
  const orderName = String(orderPayload.name || `#${orderId}`);

  // Check if points were already awarded for this specific order
  if (orderId && db.pointTransaction) {
    const existing = await db.pointTransaction.findFirst({
      where: { shop, orderId, type: "PURCHASE_EARN" },
    });
    if (existing) {
      return { awarded: false, reason: "Points already awarded for this order" };
    }
  }

  const account = await db.customerPointAccount.upsert({
    where: { shop_customerEmail: { shop, customerEmail } },
    create: {
      shop,
      customerEmail,
      customerName,
      pointsBalance: pointsToAward,
      totalPointsEarned: pointsToAward,
      totalPointsRedeemed: 0,
      totalSpend: orderSpend,
      orderCount: 1,
    },
    update: {
      customerName: customerName || undefined,
      pointsBalance: { increment: pointsToAward },
      totalPointsEarned: { increment: pointsToAward },
      totalSpend: { increment: orderSpend },
      orderCount: { increment: 1 },
    },
  });

  if (db.pointTransaction) {
    await db.pointTransaction.create({
      data: {
        shop,
        customerEmail,
        accountId: account.id,
        orderId,
        orderName,
        points: pointsToAward,
        type: "PURCHASE_EARN",
        description: `Earned ${pointsToAward} points from order ${orderName} ($${orderSpend.toFixed(2)})`,
      },
    });
  }

  return {
    awarded: true,
    points: pointsToAward,
    customerEmail,
    newBalance: account.pointsBalance,
  };
};

export const adjustCustomerPoints = async (shop, customerEmail, pointsChange, description, customerName = "") => {
  if (!db.customerPointAccount || !customerEmail) {
    throw new Error("Missing customer point account or email");
  }

  const cleanEmail = customerEmail.trim().toLowerCase();
  const points = Number(pointsChange);
  if (isNaN(points) || points === 0) {
    throw new Error("Invalid point adjustment amount");
  }

  const existing = await db.customerPointAccount.findUnique({
    where: { shop_customerEmail: { shop, customerEmail: cleanEmail } },
  });

  const newBalance = Math.max(0, (existing?.pointsBalance || 0) + points);

  const account = await db.customerPointAccount.upsert({
    where: { shop_customerEmail: { shop, customerEmail: cleanEmail } },
    create: {
      shop,
      customerEmail: cleanEmail,
      customerName: customerName || "Customer",
      pointsBalance: newBalance,
      totalPointsEarned: points > 0 ? points : 0,
      totalPointsRedeemed: points < 0 ? Math.abs(points) : 0,
      totalSpend: 0,
      orderCount: 0,
    },
    update: {
      customerName: customerName || undefined,
      pointsBalance: newBalance,
      totalPointsEarned: points > 0 ? { increment: points } : undefined,
      totalPointsRedeemed: points < 0 ? { increment: Math.abs(points) } : undefined,
    },
  });

  if (db.pointTransaction) {
    await db.pointTransaction.create({
      data: {
        shop,
        customerEmail: cleanEmail,
        accountId: account.id,
        points,
        type: "MANUAL_ADJUST",
        description: description || `Manual adjustment by merchant: ${points > 0 ? `+${points}` : points} points`,
      },
    });
  }

  return account;
};

export const redeemPointsForDiscountCoupon = async (admin, shop, customerEmail, tier) => {
  if (!admin || !shop || !customerEmail || !tier) {
    throw new Error("Missing required parameters for redemption");
  }

  const cleanEmail = customerEmail.trim().toLowerCase();
  const requiredPoints = Math.max(1, Number(tier.points) || 100);
  const discountType = tier.type === "PERCENTAGE" ? "PERCENTAGE" : "FIXED_AMOUNT";
  const discountValue = Number(tier.value) || 5;

  const account = await db.customerPointAccount.findUnique({
    where: { shop_customerEmail: { shop, customerEmail: cleanEmail } },
  });

  if (!account || account.pointsBalance < requiredPoints) {
    throw new Error(`Insufficient points balance. You have ${account?.pointsBalance || 0} points, but ${requiredPoints} are required.`);
  }

  const settings = await getRewardPointSettings(shop);
  const lifetimeDays = settings.couponLifetimeDays || 30;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateRandomCode(settings.codePrefix);
    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + lifetimeDays * 24 * 60 * 60 * 1000);

    const discountTitle = discountType === "PERCENTAGE"
      ? `Reward Points · ${discountValue}% off`
      : `Reward Points · $${discountValue} off`;

    const customerGetsValue = discountType === "PERCENTAGE"
      ? { percentage: discountValue / 100 }
      : { discountAmount: { amount: discountValue, appliesOnEachItem: false } };

    const response = await admin.graphql(
      `#graphql
      mutation CreateRewardPointDiscount($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                codes(first: 1) {
                  nodes { code }
                }
              }
            }
          }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          basicCodeDiscount: {
            title: discountTitle,
            code,
            startsAt: startsAt.toISOString(),
            endsAt: expiresAt.toISOString(),
            context: { all: "ALL" },
            customerGets: {
              value: customerGetsValue,
              items: { all: true },
            },
            appliesOncePerCustomer: true,
            usageLimit: 1,
          },
        },
      },
    );

    const json = await response.json();
    const graphQLErrors = json.errors || [];
    const result = json.data?.discountCodeBasicCreate;
    const userErrors = result?.userErrors || [];
    const confirmedCode = result?.codeDiscountNode?.codeDiscount?.codes?.nodes?.[0]?.code;

    if (!graphQLErrors.length && !userErrors.length && result?.codeDiscountNode?.id && confirmedCode) {
      // Deduct customer points
      const updatedAccount = await db.customerPointAccount.update({
        where: { shop_customerEmail: { shop, customerEmail: cleanEmail } },
        data: {
          pointsBalance: { decrement: requiredPoints },
          totalPointsRedeemed: { increment: requiredPoints },
        },
      });

      // Record transaction
      if (db.pointTransaction) {
        await db.pointTransaction.create({
          data: {
            shop,
            customerEmail: cleanEmail,
            accountId: updatedAccount.id,
            points: -requiredPoints,
            type: "COUPON_REDEEM",
            couponCode: confirmedCode,
            description: `Redeemed ${requiredPoints} points for ${tier.label || `$${discountValue} off`} coupon (${confirmedCode})`,
          },
        });
      }

      // Record created coupon
      const couponRecord = await db.redeemedPointCoupon.create({
        data: {
          shop,
          customerEmail: cleanEmail,
          shopifyDiscountId: result.codeDiscountNode.id,
          code: confirmedCode,
          pointsSpent: requiredPoints,
          discountType,
          discountValue,
          status: "ACTIVE",
          expiresAt,
        },
      });

      return {
        ok: true,
        coupon: couponRecord,
        code: confirmedCode,
        expiresAt,
        newBalance: updatedAccount.pointsBalance,
        discountType,
        discountValue,
      };
    }

    const errors = [...graphQLErrors, ...userErrors].map((e) => e.message).filter(Boolean);
    const collision = errors.some((msg) => /already|taken|exists|unique/i.test(msg));
    if (!collision || attempt === 2) {
      throw new Error(errors.join(", ") || "Failed to create Shopify discount code.");
    }
  }

  throw new Error("Could not generate unique discount code after multiple attempts.");
};

export const deleteRedeemedPointCoupon = async (admin, shop, couponId) => {
  if (!db.redeemedPointCoupon || !couponId) {
    throw new Error("Missing coupon ID");
  }

  const record = await db.redeemedPointCoupon.findFirst({
    where: { id: couponId, shop },
  });

  if (!record) {
    throw new Error("Coupon record not found.");
  }

  if (admin && record.shopifyDiscountId) {
    try {
      await admin.graphql(
        `#graphql
        mutation DeletePointCoupon($id: ID!) {
          discountCodeDelete(id: $id) {
            deletedCodeDiscountId
            userErrors { field message }
          }
        }`,
        { variables: { id: record.shopifyDiscountId } },
      );
    } catch (e) {
      console.warn("Failed to delete discount in Shopify:", e?.message);
    }
  }

  await db.redeemedPointCoupon.delete({ where: { id: record.id } });
  return { ok: true, deletedId: couponId };
};

export const cleanupExpiredRewardCoupons = async (admin, shop) => {
  if (!db.redeemedPointCoupon) return 0;

  const now = new Date();
  const expiredCoupons = await db.redeemedPointCoupon.findMany({
    where: {
      shop,
      status: "ACTIVE",
      expiresAt: { lt: now },
    },
    take: 20,
  });

  for (const coupon of expiredCoupons) {
    if (admin && coupon.shopifyDiscountId) {
      try {
        await admin.graphql(
          `#graphql
          mutation DeleteExpiredCoupon($id: ID!) {
            discountCodeDelete(id: $id) {
              deletedCodeDiscountId
              userErrors { field message }
            }
          }`,
          { variables: { id: coupon.shopifyDiscountId } },
        );
      } catch (e) {
        console.warn("Shopify cleanup expired coupon error:", e?.message);
      }
    }

    await db.redeemedPointCoupon.update({
      where: { id: coupon.id },
      data: { status: "EXPIRED", deletedAt: new Date() },
    }).catch(() => null);
  }

  return expiredCoupons.length;
};

export const getRewardPointsData = async (shop) => {
  const [settings, totalCustomers, pointsAggregation, recentCoupons, recentTransactions] = await Promise.all([
    getRewardPointSettings(shop),
    db.customerPointAccount ? db.customerPointAccount.count({ where: { shop } }) : 0,
    db.customerPointAccount
      ? db.customerPointAccount.aggregate({
          where: { shop },
          _sum: {
            pointsBalance: true,
            totalPointsEarned: true,
            totalPointsRedeemed: true,
            totalSpend: true,
          },
        })
      : { _sum: { pointsBalance: 0, totalPointsEarned: 0, totalPointsRedeemed: 0, totalSpend: 0 } },
    db.redeemedPointCoupon
      ? db.redeemedPointCoupon.findMany({
          where: { shop },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [],
    db.pointTransaction
      ? db.pointTransaction.findMany({
          where: { shop },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [],
  ]);

  const customerAccounts = db.customerPointAccount
    ? await db.customerPointAccount.findMany({
        where: { shop },
        orderBy: { pointsBalance: "desc" },
        take: 100,
      })
    : [];

  return {
    settings,
    stats: {
      totalCustomers: totalCustomers || 0,
      activePointsBalance: pointsAggregation?._sum?.pointsBalance || 0,
      totalPointsEarned: pointsAggregation?._sum?.totalPointsEarned || 0,
      totalPointsRedeemed: pointsAggregation?._sum?.totalPointsRedeemed || 0,
      totalSpend: pointsAggregation?._sum?.totalSpend || 0,
    },
    customerAccounts: customerAccounts || [],
    recentCoupons: (recentCoupons || []).map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      expiresAt: c.expiresAt.toISOString(),
      deletedAt: c.deletedAt?.toISOString() || null,
      updatedAt: c.updatedAt?.toISOString() || null,
    })),
    recentTransactions: (recentTransactions || []).map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
    })),
  };
};
