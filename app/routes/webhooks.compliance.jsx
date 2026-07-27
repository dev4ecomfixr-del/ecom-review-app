import { authenticate } from "../shopify.server";
import db from "../db.server";

const isTopic = (topic, graphqlName, restName) =>
  topic === graphqlName || topic === restName;

const redactCustomerData = async (shop, payload) => {
  const customerEmail = String(payload?.customer?.email || "").trim();

  if (!customerEmail) return;

  await db.$transaction([
    db.pendingEmailNotification.deleteMany({
      where: {
        shop,
        customerEmail: { equals: customerEmail },
      },
    }),
    db.review.updateMany({
      where: {
        shop,
        customerEmail: { equals: customerEmail },
      },
      data: {
        customerEmail: null,
        customerName: "Deleted customer",
      },
    }),
  ]);
};

const redactShopData = async (shop) => {
  await db.$transaction([
    db.generatedCoupon.deleteMany({ where: { shop } }),
    db.reviewPhoto.deleteMany({ where: { shop } }),
    db.review.deleteMany({ where: { shop } }),
    db.pendingEmailNotification.deleteMany({ where: { shop } }),
    db.emailNotificationSetting.deleteMany({ where: { shop } }),
    db.filterWord.deleteMany({ where: { shop } }),
    db.shopPlan.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);
};

export const action = async ({ request }) => {
  // authenticate.webhook validates Shopify's HMAC before any payload is used.
  // Invalid or missing signatures receive a 401 response from the Shopify SDK.
  const { payload, shop, topic } = await authenticate.webhook(request);

  if (isTopic(topic, "CUSTOMERS_REDACT", "customers/redact")) {
    await redactCustomerData(shop, payload);
  } else if (isTopic(topic, "SHOP_REDACT", "shop/redact")) {
    await redactShopData(shop);
  } else if (
    !isTopic(topic, "CUSTOMERS_DATA_REQUEST", "customers/data_request")
  ) {
    return new Response("Unsupported compliance webhook topic.", {
      status: 400,
    });
  }

  return new Response(null, { status: 200 });
};
