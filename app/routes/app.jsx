import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getShopMonthlyUsage } from "../lib/shop-plans.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const usage = await getShopMonthlyUsage(session.shop).catch(() => null);
  const isAccessEnabled = usage ? usage.isAccessEnabled !== false : true;

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
    isAccessEnabled,
    planName: usage?.planName || "Pro",
  };
};

export const action = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
    const usage = await getShopMonthlyUsage(session.shop).catch(() => null);
    if (usage && usage.isAccessEnabled === false) {
      return { ok: false, error: "App access is currently disabled for this store." };
    }

    const formData = await request.formData();
    const intent = formData.get("intent");
    const reviewId = formData.get("reviewId");

    if (intent === "save-reply" && reviewId && db.review) {
      const merchantReply = String(formData.get("merchantReply") || "").trim().slice(0, 1000);
      await db.review.updateMany({
        where: { id: String(reviewId), shop: session.shop },
        data: {
          merchantReply: merchantReply || null,
          repliedAt: merchantReply ? new Date() : null,
        },
      });
      return { ok: true, reviewId, merchantReply };
    }

    return { ok: true };
  } catch (error) {
    console.error("Action error in app.jsx:", error);
    return { ok: false, error: error?.message || "Failed to save" };
  }
};

export default function App() {
  const { apiKey, isAccessEnabled, shop } = useLoaderData();

  if (isAccessEnabled === false) {
    return (
      <AppProvider embedded apiKey={apiKey}>
        <div
          style={{
            minHeight: "75vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem 1.5rem",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: "500px",
              width: "100%",
              background: "#ffffff",
              border: "1px solid #e4e4e7",
              borderRadius: "18px",
              padding: "2.75rem 2.25rem",
              textAlign: "center",
              boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.08)",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "16px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1.25rem",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
              </svg>
            </div>
            <h2
              style={{
                fontSize: "1.35rem",
                fontWeight: 800,
                color: "#18181b",
                margin: "0 0 0.5rem",
                letterSpacing: "-0.02em",
              }}
            >
              App Access Disabled
            </h2>
            <p
              style={{
                fontSize: "0.88rem",
                color: "#71717a",
                lineHeight: 1.5,
                margin: "0 0 1.5rem",
              }}
            >
              Application access has been paused for <strong>{shop}</strong> by your platform administrator.
            </p>
            <div
              style={{
                background: "#fafafa",
                border: "1px solid #e4e4e7",
                borderRadius: "12px",
                padding: "0.9rem 1.1rem",
                fontSize: "0.82rem",
                color: "#52525b",
                lineHeight: 1.5,
                marginBottom: "1.75rem",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, color: "#18181b", marginBottom: "4px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ef4444" }}></span>
                <span>Services Inactive</span>
              </div>
              Storefront reviews, widgets, notifications, and merchant management features are currently disabled. Contact your app administrator to re-enable access.
            </div>
            <div style={{ fontSize: "0.72rem", color: "#a1a1aa", fontWeight: 600 }}>
              ReviewLift Operations · Access Restriction Active
            </div>
          </div>
        </div>
      </AppProvider>
    );
  }

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/widgets">Widgets</s-link>
        <s-link href="/app/review-reward">Review reward</s-link>
        <s-link href="/app/reward-points">Reward Points</s-link>
        <s-link href="/app/order-notifications">Order Notifications</s-link>
        <s-link href="/app/filters">Content Moderation</s-link>
        <s-link href="/app/pricing">Pricing</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
