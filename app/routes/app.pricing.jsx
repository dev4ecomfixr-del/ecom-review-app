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
  PLAN_CODES,
  getPlanByCode,
  getPlanUsageLabel,
  isValidPlanCode,
} from "../lib/plans";
import { syncStarBadgeAvailability } from "../lib/app-feature-metafields.server";
import { getShopPlanCode, setShopPlanCode } from "../lib/shop-plans.server";
import styles from "../styles/pricing.module.css";

const PAID_PLAN_CODES = [PLAN_CODES.GROWTH, PLAN_CODES.PRO];
const PAID_PLAN_PRIORITY = [PLAN_CODES.PRO, PLAN_CODES.GROWTH];

const isShopifyBillingEnabled = () =>
  process.env.SHOPIFY_BILLING_ENABLED !== "false";

const isBillingTestMode = () =>
  process.env.SHOPIFY_BILLING_TEST === "true" ||
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

const getActivePaidPlan = (appSubscriptions = []) => {
  const activePlanNames = appSubscriptions.map((subscription) => subscription.name);

  return PAID_PLAN_PRIORITY.find((planCode) =>
    activePlanNames.includes(planCode),
  );
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
  const billingEnabled = isShopifyBillingEnabled();
  const [planCode, reviewCount] = await Promise.all([
    getShopPlanCode(session.shop),
    db.review.count({ where: { shop: session.shop } }),
  ]);
  let currentPlanCode = planCode || DEFAULT_PLAN.code;
  let activePaidPlan = null;

  if (billingEnabled) {
    const billingCheck = await billing.check({
      plans: PAID_PLAN_CODES,
      isTest: isBillingTestMode(),
    });
    activePaidPlan = getActivePaidPlan(billingCheck.appSubscriptions);
  }

  if (activePaidPlan && currentPlanCode !== activePaidPlan) {
    await setShopPlanCode(session.shop, activePaidPlan);
    currentPlanCode = activePaidPlan;
  }

  if (billingEnabled && PAID_PLAN_CODES.includes(currentPlanCode) && !activePaidPlan) {
    await setShopPlanCode(session.shop, DEFAULT_PLAN.code);
    currentPlanCode = DEFAULT_PLAN.code;
  }

  if (
    billingPlan &&
    PAID_PLAN_CODES.includes(billingPlan) &&
    activePaidPlan !== billingPlan
  ) {
    currentPlanCode = DEFAULT_PLAN.code;
  }

  const currentPlan = getPlanByCode(currentPlanCode);

  await syncStarBadgeAvailability(admin, currentPlan.code);

  return {
    billingEnabled,
    currentPlanCode: currentPlan.code,
    isLimitReached:
      currentPlan.reviewLimit !== null && reviewCount >= currentPlan.reviewLimit,
    reviewCount,
    usageLabel: getPlanUsageLabel(currentPlan, reviewCount),
  };
};

export const action = async ({ request }) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = String(formData.get("plan") || "");
  const billingEnabled = isShopifyBillingEnabled();

  if (!isValidPlanCode(plan)) {
    return { ok: false };
  }

  if (billingEnabled && PAID_PLAN_CODES.includes(plan)) {
    try {
      await billing.request({
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

  if (billingEnabled && plan === DEFAULT_PLAN.code) {
    const billingCheck = await billing.check({
      plans: PAID_PLAN_CODES,
      isTest: isBillingTestMode(),
    });

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
  const { billingEnabled, currentPlanCode, isLimitReached, usageLabel } =
    useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const selectedPlan =
    actionData?.error
      ? currentPlanCode
      : navigation.formData?.get("plan") || actionData?.plan || currentPlanCode;
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
                    {...(isSaving && selectedPlan === plan.code
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
            <h3>
              {billingEnabled
                ? "Shopify billing is active"
                : "Shopify billing is disabled"}
            </h3>
            <p>
              {billingEnabled
                ? "Paid plans redirect merchants to Shopify for subscription approval before the plan is saved for this shop."
                : "Enable Shopify Billing before offering paid plans. Paid features are not activated while billing is disabled."}
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
