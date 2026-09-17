import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

import db from "../db.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export const action = async ({ request }) => {
  try {
    const { session } = await authenticate.admin(request);
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
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/widgets">Widgets</s-link>
        <s-link href="/app/review-reward">Review reward</s-link>
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
