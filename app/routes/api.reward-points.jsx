import db from "../db.server.js";
import { unauthenticated } from "../shopify.server";
import {
  getRewardPointSettings,
  redeemPointsForDiscountCoupon,
} from "../lib/reward-points.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const shop = String(url.searchParams.get("shop") || "").trim();
  const customerEmail = String(url.searchParams.get("email") || "").trim().toLowerCase();

  if (!shop) {
    return jsonResponse({ error: "Missing shop parameter", ok: false }, 400);
  }

  const settings = await getRewardPointSettings(shop);
  if (!settings.enabled) {
    return jsonResponse({ ok: false, enabled: false, message: "Reward points system is disabled." });
  }

  let account = null;
  let activeCoupons = [];

  if (customerEmail && db.customerPointAccount) {
    account = await db.customerPointAccount.findUnique({
      where: { shop_customerEmail: { shop, customerEmail } },
      select: {
        customerEmail: true,
        customerName: true,
        pointsBalance: true,
        totalPointsEarned: true,
        totalPointsRedeemed: true,
        totalSpend: true,
      },
    });

    if (db.redeemedPointCoupon) {
      const now = new Date();
      activeCoupons = await db.redeemedPointCoupon.findMany({
        where: {
          shop,
          customerEmail,
          status: "ACTIVE",
          expiresAt: { gt: now },
        },
        select: {
          code: true,
          pointsSpent: true,
          discountType: true,
          discountValue: true,
          expiresAt: true,
        },
        orderBy: { createdAt: "desc" },
      });
    }
  }

  return jsonResponse({
    ok: true,
    enabled: settings.enabled,
    pointUnitName: settings.pointUnitName,
    pointsPerDollar: settings.pointsPerDollar,
    redemptionTiers: settings.redemptionTiers,
    account: account || {
      customerEmail: customerEmail || "",
      pointsBalance: 0,
      totalPointsEarned: 0,
      totalPointsRedeemed: 0,
    },
    activeCoupons: activeCoupons.map((c) => ({
      ...c,
      expiresAt: c.expiresAt.toISOString(),
    })),
  });
};

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body = {};
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    }

    const shop = String(body.shop || "").trim();
    const customerEmail = String(body.customerEmail || body.email || "").trim().toLowerCase();
    const intent = String(body.intent || "redeem");

    if (!shop || !customerEmail) {
      return jsonResponse({ error: "Missing shop or customer email", ok: false }, 400);
    }

    if (intent === "redeem") {
      const points = Number(body.points || 0);
      const tierIndex = Number(body.tierIndex);
      const settings = await getRewardPointSettings(shop);

      if (!settings.enabled) {
        return jsonResponse({ error: "Reward points system is disabled", ok: false }, 400);
      }

      let tier = null;
      if (!isNaN(tierIndex) && settings.redemptionTiers[tierIndex]) {
        tier = settings.redemptionTiers[tierIndex];
      } else if (points > 0) {
        tier = settings.redemptionTiers.find((t) => t.points === points);
      }

      if (!tier) {
        return jsonResponse({ error: "Invalid redemption tier selected", ok: false }, 400);
      }

      const { admin } = await unauthenticated.admin(shop);
      const result = await redeemPointsForDiscountCoupon(admin, shop, customerEmail, tier);

      return jsonResponse({
        ok: true,
        message: `Successfully redeemed coupon: ${result.code}`,
        code: result.code,
        discountType: result.discountType,
        discountValue: result.discountValue,
        newBalance: result.newBalance,
        expiresAt: result.expiresAt.toISOString(),
      });
    }

    return jsonResponse({ error: "Unsupported intent", ok: false }, 400);
  } catch (error) {
    console.error("API Reward Points error:", error);
    return jsonResponse({ error: error.message || "Redemption failed", ok: false }, 500);
  }
};
