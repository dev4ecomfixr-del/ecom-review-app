import process from "node:process";

import { Resend } from "resend";

import db from "../db.server";
import { EMAIL_NOTIFICATION_VARIABLES } from "./email-notification-constants";

export { EMAIL_NOTIFICATION_VARIABLES } from "./email-notification-constants";

export const DEFAULT_EMAIL_NOTIFICATION = {
  enabled: false,
  subject: "How was your recent order?",
  body: `Hi {{customer_name}},

Thank you for your order {{order_name}}. We would love to hear what you think about your purchase.

Share your feedback here: {{review_link}}`,
  delayDays: 2,
};

export const ORDER_NOTIFICATIONS_PAUSED = true;

const MAX_DELAY_DAYS = 30;
const MAX_SUBJECT_LENGTH = 120;
const MAX_BODY_LENGTH = 4000;

const normalizeDelayDays = (delayDays) => {
  const parsedDelay = Number.parseInt(String(delayDays), 10);

  if (Number.isNaN(parsedDelay)) {
    return DEFAULT_EMAIL_NOTIFICATION.delayDays;
  }

  return Math.min(Math.max(parsedDelay, 0), MAX_DELAY_DAYS);
};

const normalizeText = (value, fallback, maxLength) => {
  const text = String(value || "").trim();

  if (!text) {
    return fallback;
  }

  return text.slice(0, maxLength);
};

export const getEmailNotificationSetting = async (shop) => {
  const setting = await db.emailNotificationSetting.findUnique({
    where: { shop },
  });

  return setting || DEFAULT_EMAIL_NOTIFICATION;
};

export const updateEmailNotificationSetting = async (shop, formData) => {
  const enabled = formData.get("enabled") === "on";
  const subject = normalizeText(
    formData.get("subject"),
    DEFAULT_EMAIL_NOTIFICATION.subject,
    MAX_SUBJECT_LENGTH,
  );
  const body = normalizeText(
    formData.get("body"),
    DEFAULT_EMAIL_NOTIFICATION.body,
    MAX_BODY_LENGTH,
  );
  const delayDays = normalizeDelayDays(formData.get("delayDays"));

  return db.emailNotificationSetting.upsert({
    where: { shop },
    create: {
      shop,
      enabled,
      subject,
      body,
      delayDays,
    },
    update: {
      enabled,
      subject,
      body,
      delayDays,
    },
  });
};

const getOrderCustomerEmail = (order) =>
  order?.email ||
  order?.contact_email ||
  order?.customer?.email ||
  order?.shipping_address?.email ||
  "";

const getOrderCustomerName = (order) => {
  const firstName =
    order?.customer?.first_name || order?.shipping_address?.first_name || "";
  const lastName =
    order?.customer?.last_name || order?.shipping_address?.last_name || "";
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || order?.billing_address?.name || "customer";
};

const getReviewLink = (shop, order, customerName, customerEmail) => {
  const params = new URLSearchParams({ shop, page: "1" });
  if (customerName) params.set("name", customerName);
  if (customerEmail) params.set("email", customerEmail);
  const handle =
    order?.line_items?.[0]?.handle ||
    order?.line_items?.[0]?.product_handle ||
    order?.lineItems?.[0]?.product?.handle ||
    order?.productHandle ||
    "";
  const productId =
    order?.line_items?.[0]?.product_id ||
    order?.lineItems?.[0]?.product?.id ||
    order?.productId ||
    "";
  const productTitle =
    order?.line_items?.[0]?.title ||
    order?.lineItems?.[0]?.title ||
    order?.productTitle ||
    "";
  if (handle) params.set("product", handle);
  else if (productId) params.set("productId", String(productId));
  if (productTitle) params.set("productTitle", productTitle);
  return `https://${shop}/apps/reviews?${params.toString()}`;
};

const renderTemplate = (template, order, shop) => {
  const customerName = getOrderCustomerName(order);
  const customerEmail = getOrderCustomerEmail(order);
  const values = {
    "{{customer_name}}": customerName,
    "{{order_name}}": order?.name || `#${order?.order_number || order?.id}`,
    "{{shop}}": shop,
    "{{review_link}}": getReviewLink(shop, order, customerName, customerEmail),
  };

  return EMAIL_NOTIFICATION_VARIABLES.reduce(
    (message, variable) => message.split(variable).join(values[variable] || ""),
    template,
  );
};

export const scheduleOrderEmailNotification = async (shop, order) => {
  if (ORDER_NOTIFICATIONS_PAUSED) {
    return {
      queued: false,
      reason: "Order notification features are temporarily paused.",
    };
  }

  const setting = await getEmailNotificationSetting(shop);

  if (!setting.enabled) {
    return { queued: false, reason: "Email notification is disabled." };
  }

  const customerEmail = getOrderCustomerEmail(order);

  if (!customerEmail) {
    return { queued: false, reason: "Order does not include a customer email." };
  }

  const orderId = String(order?.admin_graphql_api_id || order?.id || "");

  if (!orderId) {
    return { queued: false, reason: "Order does not include an id." };
  }

  const sendAt = new Date();
  sendAt.setDate(sendAt.getDate() + normalizeDelayDays(setting.delayDays));

  const notification = await db.pendingEmailNotification.upsert({
    where: {
      shop_orderId: {
        shop,
        orderId,
      },
    },
    create: {
      shop,
      orderId,
      orderName: order?.name || null,
      customerEmail,
      customerName: getOrderCustomerName(order),
      subject: renderTemplate(setting.subject, order, shop),
      body: renderTemplate(setting.body, order, shop),
      sendAt,
    },
    update: {
      customerEmail,
      customerName: getOrderCustomerName(order),
      subject: renderTemplate(setting.subject, order, shop),
      body: renderTemplate(setting.body, order, shop),
      sendAt,
      status: "QUEUED",
      error: null,
      sentAt: null,
    },
  });

  return { queued: true, notification };
};

const sendEmail = async (notification) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  if (!apiKey) {
    throw new Error("Set RESEND_API_KEY in .env to send emails.");
  }

  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from,
    to: notification.customerEmail,
    subject: notification.subject,
    text: notification.body,
    html: `<p>${notification.body.replaceAll("\n", "<br>")}</p>`,
  });

  if (error) {
    throw new Error(error.message || "Resend could not send the email.");
  }
};

export const sendEmailToCustomer = async (
  shop,
  { customerEmail, customerName, orderName, orderId, productHandle, productId, productTitle },
) => {
  if (ORDER_NOTIFICATIONS_PAUSED) {
    throw new Error("Order notification features are temporarily paused.");
  }

  const setting = await getEmailNotificationSetting(shop);
  const nameParts = (customerName || "").split(" ");
  const mockOrder = {
    name: orderName,
    id: orderId,
    customer: { first_name: nameParts[0] || "", last_name: nameParts.slice(1).join(" ") },
    email: customerEmail,
    productHandle,
    productId,
    productTitle,
  };
  const subject = renderTemplate(setting.subject, mockOrder, shop);
  const body = renderTemplate(setting.body, mockOrder, shop);
  await sendEmail({ customerEmail, subject, body });
};

export const sendTestEmailNotification = async (shop, recipientEmail) => {
  if (ORDER_NOTIFICATIONS_PAUSED) {
    throw new Error("Order notification features are temporarily paused.");
  }

  const setting = await getEmailNotificationSetting(shop);
  const mockOrder = {
    name: "#TEST-001",
    order_number: "TEST-001",
    id: "test-order-id",
    customer: { first_name: "Test", last_name: "Customer" },
  };
  const subject = `[TEST] ${renderTemplate(setting.subject, mockOrder, shop)}`;
  const body = renderTemplate(setting.body, mockOrder, shop);
  await sendEmail({ customerEmail: recipientEmail, subject, body });
};

export const processDueEmailNotifications = async (limit = 25) => {
  if (ORDER_NOTIFICATIONS_PAUSED) {
    return [];
  }

  const notifications = await db.pendingEmailNotification.findMany({
    where: {
      status: "QUEUED",
      sendAt: {
        lte: new Date(),
      },
    },
    orderBy: { sendAt: "asc" },
    take: limit,
  });

  const results = [];

  for (const notification of notifications) {
    try {
      await sendEmail(notification);
      await db.pendingEmailNotification.update({
        where: { id: notification.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          error: null,
        },
      });
      results.push({ id: notification.id, status: "SENT" });
    } catch (error) {
      await db.pendingEmailNotification.update({
        where: { id: notification.id },
        data: {
          status: "FAILED",
          error: error.message,
        },
      });
      results.push({
        id: notification.id,
        status: "FAILED",
        error: error.message,
      });
    }
  }

  return results;
};
