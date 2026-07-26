import { useEffect, useRef } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { EMAIL_NOTIFICATION_VARIABLES } from "../lib/email-notification-constants";
import {
  getEmailNotificationSetting,
  sendEmailToCustomer,
  sendTestEmailNotification,
  updateEmailNotificationSetting,
} from "../lib/email-notifications.server";
import styles from "../styles/widgets.module.css";

const ORDER_NOTIFICATIONS_PAUSED = true;

const fetchRecentOrders = async (admin) => {
  try {
    const response = await admin.graphql(`
      #graphql
      query RecentOrders {
        orders(first: 10, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            name
            createdAt
            email
            displayFinancialStatus
            displayFulfillmentStatus
            customer {
              firstName
              lastName
            }
            lineItems(first: 1) {
              nodes {
                title
                product {
                  id
                  handle
                }
              }
            }
            totalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
    `);
    const payload = await response.json();

    if (payload.errors) {
      const message = payload.errors
        .map((error) => error.message)
        .filter(Boolean)
        .join(" ");

      return {
        error: `Orders could not be loaded. ${message}`,
        orders: [],
      };
    }

    return {
      error: null,
      orders: payload.data.orders.nodes.map((order) => {
        const firstName = order.customer?.firstName || "";
        const lastName = order.customer?.lastName || "";
        const customerName = `${firstName} ${lastName}`.trim() || "Customer";
        const firstItem = order.lineItems?.nodes?.[0];

        return {
          id: order.id,
          createdAt: order.createdAt,
          customerEmail: order.email || "",
          customerName,
          financialStatus: order.displayFinancialStatus || "unknown",
          fulfillmentStatus: order.displayFulfillmentStatus || "unfulfilled",
          name: order.name,
          productHandle: firstItem?.product?.handle || "",
          productId: firstItem?.product?.id || "",
          productTitle: firstItem?.title || "",
          total: `${order.totalPriceSet.shopMoney.amount} ${order.totalPriceSet.shopMoney.currencyCode}`,
        };
      }),
    };
  } catch (error) {
    console.error("Failed to fetch orders", error);

    return {
      error: `Orders could not be loaded. ${
        error.message || "Check read_orders and protected customer data access."
      }`,
      orders: [],
    };
  }
};

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const emailNotificationSetting = await getEmailNotificationSetting(
    session.shop,
  );
  let shopEmail = "";

  try {
    const shopResponse = await admin.graphql(`#graphql
      query { shop { email } }
    `);
    const shopData = await shopResponse.json();
    shopEmail = shopData.data?.shop?.email || "";
  } catch (error) {
    console.error("Failed to fetch shop email", error);
  }

  return {
    emailNotificationSetting,
    recentOrders: {
      error: null,
      orders: [],
    },
    shopEmail,
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (ORDER_NOTIFICATIONS_PAUSED) {
    return {
      error: "Order notification features are temporarily paused.",
      ok: false,
    };
  }

  if (intent === "save-email-notification") {
    try {
      const emailNotificationSetting = await updateEmailNotificationSetting(
        session.shop,
        formData,
      );

      return { emailNotificationSetting, ok: true };
    } catch (error) {
      console.error("Failed to save email notification settings", error);

      return {
        error: "Email notification settings could not be saved.",
        ok: false,
      };
    }
  }

  if (intent === "load-orders") {
    const recentOrders = await fetchRecentOrders(admin);

    return { ok: true, recentOrders };
  }

  if (intent === "send-test-email") {
    try {
      const shopResponse = await admin.graphql(`#graphql
        query { shop { email } }
      `);
      const shopData = await shopResponse.json();
      const recipientEmail = shopData.data?.shop?.email;

      if (!recipientEmail) {
        return { error: "Could not find shop owner email.", ok: false };
      }

      await sendTestEmailNotification(session.shop, recipientEmail);

      return { ok: true, sentTo: recipientEmail, testEmailSent: true };
    } catch (error) {
      return { error: error.message, ok: false };
    }
  }

  if (intent === "send-order-email") {
    const customerEmail = String(formData.get("customerEmail") || "").trim();
    const customerName = String(formData.get("customerName") || "Customer");
    const orderName = String(formData.get("orderName") || "");
    const orderId = String(formData.get("orderId") || "");
    const productHandle = String(formData.get("productHandle") || "");
    const productId = String(formData.get("productId") || "");
    const productTitle = String(formData.get("productTitle") || "");

    if (!customerEmail) {
      return {
        ok: false,
        orderEmailError: "No email address for this order.",
        orderId,
      };
    }

    try {
      await sendEmailToCustomer(session.shop, {
        customerEmail,
        customerName,
        orderId,
        orderName,
        productHandle,
        productId,
        productTitle,
      });

      return { ok: true, orderEmailSent: true, orderId, sentTo: customerEmail };
    } catch (error) {
      return { ok: false, orderEmailError: error.message, orderId };
    }
  }

  return { ok: false };
};

export default function OrderNotifications() {
  const { emailNotificationSetting, recentOrders, shopEmail } = useLoaderData();
  const fetcher = useFetcher();
  const orderFetcher = useFetcher();
  const testEmailFetcher = useFetcher();
  const orderEmailFetcher = useFetcher();
  const orderFetcherRef = useRef(orderFetcher);
  orderFetcherRef.current = orderFetcher;

  const activeEmailSetting =
    fetcher.data?.emailNotificationSetting || emailNotificationSetting;
  const activeRecentOrders = orderFetcher.data?.recentOrders || recentOrders;
  const isLoadingOrders = orderFetcher.state !== "idle";
  const isSavingEmailSetting = fetcher.state !== "idle";
  const isSendingTestEmail = testEmailFetcher.state !== "idle";
  const sendingOrderId =
    orderEmailFetcher.state !== "idle"
      ? String(orderEmailFetcher.formData?.get("orderId") || "")
      : null;

  useEffect(() => {
    if (ORDER_NOTIFICATIONS_PAUSED) {
      return undefined;
    }

    const autoRefresh = () => {
      if (orderFetcherRef.current.state === "idle") {
        orderFetcherRef.current.submit(
          { intent: "load-orders" },
          { method: "post" },
        );
      }
    };

    autoRefresh();
    const id = setInterval(autoRefresh, 3000);

    return () => clearInterval(id);
  }, []);

  if (ORDER_NOTIFICATIONS_PAUSED) {
    return (
      <s-page heading="Order Notifications">
        <s-section heading="Email notification">
          <div className={styles.comingSoonBanner}>
            This feature is coming soon. Order notification tools are
            temporarily paused.
          </div>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Order Notifications">
      <s-section heading="Email notification">
        <div className={styles.comingSoonBanner}>
          This feature is coming soon. Order notification tools are temporarily
          paused.
        </div>

        <div className={styles.hero}>
          <p className={styles.eyebrow}>After order email</p>
          <h2>Send review request after purchase</h2>
          <p>
            Configure the email body, timing, test delivery, and customer order
            emails from one place.
          </p>
        </div>

        <fetcher.Form className={styles.emailForm} method="post">
          <input
            type="hidden"
            name="intent"
            value="save-email-notification"
          />

          <label className={`${styles.optionCard} ${styles.toggleCard}`}>
            <span>Status</span>
            <h3>Email notification</h3>
            <div className={styles.checkboxRow}>
              <input
                defaultChecked={
                  ORDER_NOTIFICATIONS_PAUSED ? false : activeEmailSetting.enabled
                }
                disabled={ORDER_NOTIFICATIONS_PAUSED}
                name="enabled"
                type="checkbox"
              />
              <p>Send an email to customers after they place an order</p>
            </div>
          </label>

          <div className={styles.emailGrid}>
            <label className={styles.optionCard}>
              <span>Timing</span>
              <h3>Send after</h3>
              <input
                defaultValue={activeEmailSetting.delayDays}
                disabled={ORDER_NOTIFICATIONS_PAUSED}
                max="30"
                min="0"
                name="delayDays"
                type="number"
              />
              <p>Use 0 for same day, 1 for next day, or 2 for two days later.</p>
            </label>

            <label className={styles.optionCard}>
              <span>Subject</span>
              <h3>Email subject</h3>
              <input
                defaultValue={activeEmailSetting.subject}
                disabled={ORDER_NOTIFICATIONS_PAUSED}
                maxLength={120}
                name="subject"
                placeholder="How was your recent order?"
                required
              />
              <p>Short subject line shown in the customer inbox.</p>
            </label>
          </div>

          <label className={styles.messageCard}>
            <span>Message</span>
            <h3>Email body</h3>
            <textarea
              defaultValue={activeEmailSetting.body}
              disabled={ORDER_NOTIFICATIONS_PAUSED}
              maxLength={4000}
              name="body"
              placeholder="Write your customer email..."
              required
              rows={8}
            />
            <p>
              Available variables: {EMAIL_NOTIFICATION_VARIABLES.join(", ")}.
            </p>
          </label>

          <div className={styles.formActions}>
            <s-button
              disabled={
                ORDER_NOTIFICATIONS_PAUSED || isSavingEmailSetting
                  ? true
                  : undefined
              }
              loading={isSavingEmailSetting ? true : undefined}
              type="submit"
              variant="primary"
            >
              Save email settings
            </s-button>
            {fetcher.data?.ok ? (
              <span className={styles.successMessage}>Saved</span>
            ) : null}
            {fetcher.data?.error ? (
              <span className={styles.errorMessage}>{fetcher.data.error}</span>
            ) : null}
          </div>
        </fetcher.Form>

        <testEmailFetcher.Form className={styles.testEmailForm} method="post">
          <input type="hidden" name="intent" value="send-test-email" />
          <div className={styles.formActions}>
            <s-button
              disabled={
                ORDER_NOTIFICATIONS_PAUSED || isSendingTestEmail
                  ? true
                  : undefined
              }
              loading={isSendingTestEmail ? true : undefined}
              type="submit"
              variant="secondary"
            >
              Send test email
            </s-button>
            {shopEmail ? (
              <span className={styles.helperText}>Sends to {shopEmail}</span>
            ) : null}
          </div>
          {testEmailFetcher.data?.testEmailSent ? (
            <span className={styles.successMessage}>
              Test email sent to {testEmailFetcher.data.sentTo}
            </span>
          ) : null}
          {testEmailFetcher.data?.error ? (
            <span className={styles.errorMessage}>
              {testEmailFetcher.data.error}
            </span>
          ) : null}
        </testEmailFetcher.Form>

        <div className={styles.ordersPanel}>
          <div className={styles.panelHeader}>
            <div>
              <span>Recent orders</span>
              <h3>Order list</h3>
            </div>
            <orderFetcher.Form method="post">
              <input type="hidden" name="intent" value="load-orders" />
              <s-button
                disabled={
                  ORDER_NOTIFICATIONS_PAUSED || isLoadingOrders
                    ? true
                    : undefined
                }
                loading={isLoadingOrders ? true : undefined}
                type="submit"
                variant="secondary"
              >
                Load orders
              </s-button>
            </orderFetcher.Form>
          </div>

          {activeRecentOrders.error ? (
            <p className={styles.orderNotice}>{activeRecentOrders.error}</p>
          ) : null}

          {!activeRecentOrders.error && activeRecentOrders.orders.length === 0 ? (
            <p className={styles.orderNotice}>
              Order notifications are paused for now.
            </p>
          ) : null}

          {activeRecentOrders.orders.length > 0 ? (
            <div className={styles.orderList}>
              {activeRecentOrders.orders.map((order) => (
                <article className={styles.orderCard} key={order.id}>
                  <div>
                    <strong>{order.name}</strong>
                    <p>
                      {order.customerName}
                      {order.customerEmail ? ` • ${order.customerEmail}` : ""}
                    </p>
                  </div>
                  <div className={styles.orderMeta}>
                    <span>{order.total}</span>
                    <p>
                      {order.financialStatus} / {order.fulfillmentStatus}
                    </p>
                  </div>
                  <div className={styles.orderAction}>
                    {order.customerEmail ? (
                      <orderEmailFetcher.Form method="post">
                        <input
                          type="hidden"
                          name="intent"
                          value="send-order-email"
                        />
                        <input type="hidden" name="orderId" value={order.id} />
                        <input
                          type="hidden"
                          name="customerEmail"
                          value={order.customerEmail}
                        />
                        <input
                          type="hidden"
                          name="customerName"
                          value={order.customerName}
                        />
                        <input
                          type="hidden"
                          name="orderName"
                          value={order.name}
                        />
                        <input
                          type="hidden"
                          name="productHandle"
                          value={order.productHandle}
                        />
                        <input
                          type="hidden"
                          name="productId"
                          value={order.productId}
                        />
                        <input
                          type="hidden"
                          name="productTitle"
                          value={order.productTitle}
                        />
                        <s-button
                          disabled={
                            ORDER_NOTIFICATIONS_PAUSED ||
                            sendingOrderId === order.id
                              ? true
                              : undefined
                          }
                          loading={sendingOrderId === order.id ? true : undefined}
                          size="slim"
                          type="submit"
                          variant="secondary"
                        >
                          Send mail
                        </s-button>
                        {orderEmailFetcher.data?.orderEmailSent &&
                        orderEmailFetcher.data?.orderId === order.id ? (
                          <span className={styles.successMessage}>Sent!</span>
                        ) : null}
                        {orderEmailFetcher.data?.orderEmailError &&
                        orderEmailFetcher.data?.orderId === order.id ? (
                          <span className={styles.errorMessage}>
                            {orderEmailFetcher.data.orderEmailError}
                          </span>
                        ) : null}
                      </orderEmailFetcher.Form>
                    ) : (
                      <span className={styles.noEmailNote}>No email</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
