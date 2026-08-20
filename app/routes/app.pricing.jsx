/* eslint-disable no-undef */
import { useEffect } from "react";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  DEFAULT_PLAN,
  PLANS,
  getPlanByCode,
  getPlanUsageLabel,
  isValidPlanCode,
} from "../lib/plans";
import { syncStarBadgeAvailability } from "../lib/app-feature-metafields.server";
import {
  PAID_PLAN_CODES,
  setShopPlanCode,
  syncShopPlanFromBilling,
} from "../lib/shop-plans.server";
import styles from "../styles/pricing.module.css";

const isBillingTestMode = () =>
  process.env.SHOPIFY_BILLING_TEST === true ||
  process.env.NODE_ENV !== "production";

const getBillingReturnUrl = (plan, shop) => {
  if (process.env.SHOPIFY_BILLING_RETURN_URL) {
    const returnUrl = new URL(process.env.SHOPIFY_BILLING_RETURN_URL);
    returnUrl.searchParams.set("billing_plan", plan);
    return returnUrl.toString();
  }

  const cleanShop = shop.replace(".myshopify.com", "");
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const returnUrl = new URL(
    `/store/${cleanShop}/apps/${apiKey}/app/pricing`,
    "https://admin.shopify.com",
  );
  returnUrl.searchParams.set("billing_plan", plan);
  return returnUrl.toString();
};

const formatBillingError = (error) => {
  const messages = (error.errorData || [])
    .map((item) => item.message)
    .filter(Boolean);

  if (messages.length > 0) {
    return messages.join(" ");
  }

  return error.message || "Shopify billing could not be started.";
};

const isCustomAppBillingError = (error) =>
  formatBillingError(error).toLowerCase().includes("custom apps cannot use");

export const loader = async ({ request }) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const billingPlan = new URL(request.url).searchParams.get("billing_plan");
  const [{ planCode: currentPlanCode }, reviewCount] = await Promise.all([
    syncShopPlanFromBilling({ billing, shop: session.shop }),
    db.review.count({ where: { shop: session.shop } }),
  ]);

  const currentPlan = getPlanByCode(currentPlanCode);
  const requestedPlan = PAID_PLAN_CODES.includes(billingPlan)
    ? getPlanByCode(billingPlan)
    : null;

  await syncStarBadgeAvailability(admin, currentPlan.code);

  return {
    billingReturnStatus: requestedPlan
      ? currentPlan.code === requestedPlan.code
        ? "approved"
        : "not-approved"
      : null,
    currentPlanCode: currentPlan.code,
    isLimitReached:
      currentPlan.reviewLimit !== null && reviewCount >= currentPlan.reviewLimit,
    reviewCount,
    requestedPlanName: requestedPlan?.name || null,
    usageLabel: getPlanUsageLabel(currentPlan, reviewCount),
  };
};

export const action = async ({ request }) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = String(formData.get("plan") || "");

  if (!isValidPlanCode(plan)) {
    return { ok: false };
  }

  if (PAID_PLAN_CODES.includes(plan)) {
    try {
      return await billing.request({
        plan,
        isTest: isBillingTestMode(),
        returnUrl: getBillingReturnUrl(plan, session.shop),
      });
    } catch (error) {
      if (error instanceof Response) {
        throw error;
      }

      console.error("Shopify billing request failed", {
        errorData: error.errorData,
        message: error.message,
      });

      if (isCustomAppBillingError(error)) {
        return {
          error:
            "Shopify Billing is unavailable because this app is configured for custom distribution. Use the App Store-distributed app configuration to test paid plans.",
          ok: false,
        };
      }

      return {
        error: formatBillingError(error),
        ok: false,
      };
    }
  }

  if (plan === DEFAULT_PLAN.code) {
    const billingCheck = await billing.check();

    await Promise.all(
      billingCheck.appSubscriptions.map((subscription) =>
        billing.cancel({
          subscriptionId: subscription.id,
          isTest: isBillingTestMode(),
          prorate: true,
        }),
      ),
    );
  }

  await setShopPlanCode(session.shop, plan);
  await syncStarBadgeAvailability(admin, plan);

  return { ok: true, plan };
};

export default function Pricing() {
  const {
    billingReturnStatus,
    currentPlanCode,
    isLimitReached,
    requestedPlanName,
    usageLabel,
  } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const selectedPlan = actionData?.error
    ? currentPlanCode
    : actionData?.plan || currentPlanCode;
  const pendingPlan = navigation.formData?.get("plan");
  const isSaving = navigation.state !== "idle";

  useEffect(() => {
    if (isLimitReached) {
      shopify.toast.show("Review limit reached. Upgrade to collect more reviews.");
    }
  }, [isLimitReached, shopify]);

  return (
    <s-page heading="Pricing" inlineSize="large">
      <s-section heading="Choose a plan">
        <div className={styles.pricingHero}>
          <p className={styles.eyebrow}>Review app pricing</p>
          <h2>Flexible plans for every stage of your store</h2>
          <p>
            Keep the free plan while you launch, then upgrade when you need
            richer workflows, analytics, and priority support.
          </p>
        </div>

        {actionData?.error ? (
          <p className={styles.billingError}>{actionData.error}</p>
        ) : null}
        {billingReturnStatus === "approved" ? (
          <s-banner tone="success">
            {requestedPlanName} is now your active subscription.
          </s-banner>
        ) : null}
        {billingReturnStatus === "not-approved" ? (
          <s-banner tone="warning">
            {requestedPlanName} was not approved. Your existing subscription
            remains active.
          </s-banner>
        ) : null}
        <div className={styles.planGrid}>
          {PLANS.map((plan) => {
            const isCurrent = selectedPlan === plan.code;

            return (
              <article
                className={`${styles.planCard} ${styles[plan.tone]} ${
                  isCurrent ? styles.currentPlan : ""
                }`}
                key={plan.name}
              >
                <div className={styles.planTop}>
                  <span>{plan.name}</span>
                  <strong>{isCurrent ? "Current" : plan.badge}</strong>
                </div>
                <div className={styles.priceRow}>
                  <h3>{plan.price}</h3>
                  {plan.suffix && <small>{plan.suffix}</small>}
                </div>
                <p>{plan.description}</p>
                <div className={styles.limitPill}>
                  {plan.reviewLimit === null
                    ? "100+ reviews · Unlimited"
                    : `${plan.reviewLimit} reviews`}
                </div>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <div className={styles.planAction}>
                  <s-button
                    onClick={() =>
                      submit(
                        { plan: plan.code },
                        { method: "post", action: "/app/pricing" },
                      )
                    }
                    variant="primary"
                    {...(isCurrent ? { disabled: true } : {})}
                    {...(isSaving && pendingPlan === plan.code
                      ? { loading: true }
                      : {})}
                  >
                    {isCurrent ? "Current plan" : "Select plan"}
                  </s-button>
                </div>
              </article>
            );
          })}
        </div>

        <div className={styles.infoGrid}>
          <div
            className={`${styles.noteCard} ${
              isLimitReached ? styles.limitReached : ""
            }`}
          >
            <h3>{usageLabel}</h3>
            <p>
              {isLimitReached
                ? "New storefront reviews will be blocked until you upgrade or free space."
                : "Review limits are enforced when customers submit new storefront reviews."}
            </p>
          </div>
          <div className={styles.noteCard}>
            <h3>Shopify billing is active</h3>
            <p>
              Paid plans redirect merchants to Shopify for subscription approval
              before the plan is saved for this shop.
            </p>
          </div>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
