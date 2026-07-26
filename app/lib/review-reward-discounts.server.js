import { randomInt } from "node:crypto";
import db from "../db.server.js";

const COUPON_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const makeCode = () => {
  let code = "";
  for (let index = 0; index < 5; index += 1) {
    code += COUPON_ALPHABET[randomInt(0, COUPON_ALPHABET.length)];
  }
  return code;
};

export const createUniqueReviewDiscount = async (admin, settings) => {
  const percentage = Math.max(
    1,
    Math.min(100, Number(settings.discountValue) || 20),
  );
  const lifetimeDays = Math.max(
    1,
    Math.min(365, Number(settings.couponLifetimeDays) || 30),
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = makeCode();
    const startsAt = new Date();
    const expiresAt = new Date(
      startsAt.getTime() + lifetimeDays * 24 * 60 * 60 * 1000,
    );
    const response = await admin.graphql(
      `#graphql
      mutation CreateReviewRewardCode($basicCodeDiscount: DiscountCodeBasicInput!) {
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
            title: `Review reward · ${percentage}% off`,
            code,
            startsAt: startsAt.toISOString(),
            endsAt: expiresAt.toISOString(),
            context: { all: "ALL" },
            customerGets: {
              value: { percentage: percentage / 100 },
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
    const confirmedCode =
      result?.codeDiscountNode?.codeDiscount?.codes?.nodes?.[0]?.code;

    if (
      !graphQLErrors.length &&
      !userErrors.length &&
      result?.codeDiscountNode?.id &&
      confirmedCode
    ) {
      return {
        code: confirmedCode,
        expiresAt,
        percentage,
        shopifyDiscountId: result.codeDiscountNode.id,
      };
    }

    const errors = [...graphQLErrors, ...userErrors]
      .map((error) => error.message)
      .filter(Boolean);
    if (!errors.length) errors.push("Shopify did not return the created coupon code.");
    const collision = errors.some((message) =>
      /already|taken|exists|unique/i.test(message),
    );
    if (!collision || attempt === 2) {
      throw new Error(errors.join(", ") || "Could not create a Shopify discount.");
    }
  }

  throw new Error("Could not generate a unique Shopify discount code.");
};

const deleteShopifyDiscount = async (admin, id) => {
  const response = await admin.graphql(
    `#graphql
    mutation DeleteExpiredReviewCoupon($id: ID!) {
      discountCodeDelete(id: $id) {
        deletedCodeDiscountId
        userErrors { field message }
      }
    }`,
    { variables: { id } },
  );
  const json = await response.json();
  const result = json.data?.discountCodeDelete;
  const errors = [...(json.errors || []), ...(result?.userErrors || [])]
    .map((error) => error.message)
    .filter(Boolean);
  if (errors.length || !result?.deletedCodeDiscountId) {
    throw new Error(errors.join(", ") || "Shopify did not confirm coupon deletion.");
  }
};

export const deleteGeneratedReviewCoupon = async (admin, shop, couponId) => {
  const coupon = await db.generatedCoupon.findFirst({
    where: { id: couponId, shop },
  });
  if (!coupon) throw new Error("Coupon record was not found.");
  if (coupon.status === "DELETED") return coupon;

  try {
    await deleteShopifyDiscount(admin, coupon.shopifyDiscountId);
  } catch (error) {
    if (!/not found|does not exist|invalid id/i.test(String(error.message || error))) {
      throw error;
    }
  }

  return db.generatedCoupon.update({
    where: { id: coupon.id },
    data: {
      deletedAt: new Date(),
      deletionError: null,
      status: "DELETED",
    },
  });
};

export const cleanupExpiredReviewCoupons = async (admin, shop) => {
  const expiredCoupons = await db.generatedCoupon.findMany({
    where: {
      expiresAt: { lte: new Date() },
      shop,
      status: { in: ["ACTIVE", "DELETE_FAILED"] },
    },
    orderBy: { expiresAt: "asc" },
    take: 50,
  });

  for (const coupon of expiredCoupons) {
    try {
      await deleteShopifyDiscount(admin, coupon.shopifyDiscountId);
      await db.generatedCoupon.update({
        where: { id: coupon.id },
        data: {
          deletedAt: new Date(),
          deletionError: null,
          status: "DELETED",
        },
      });
    } catch (error) {
      await db.generatedCoupon.update({
        where: { id: coupon.id },
        data: {
          deletionError: String(error.message || error).slice(0, 500),
          status: "DELETE_FAILED",
        },
      });
    }
  }

  return expiredCoupons.length;
};
