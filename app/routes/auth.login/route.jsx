import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { redirect } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export const action = async ({ request }) => {
  return await login(request);
};

export default function Auth() {
  return (
    <AppProvider embedded={false}>
      <s-page>
        <s-section heading="Install ReviewLift">
          <p style={{ marginBottom: "1.25rem", color: "#6d7175", fontSize: "14px", lineHeight: 1.5 }}>
            To install or open ReviewLift, please add the app directly from the official Shopify App Store or launch it from your Shopify Admin.
          </p>
          <s-button
            variant="primary"
            href="https://apps.shopify.com"
            target="_blank"
          >
            Open Shopify App Store
          </s-button>
        </s-section>
      </s-page>
    </AppProvider>
  );
}
