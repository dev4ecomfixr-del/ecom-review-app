/* eslint-disable no-undef */
import { useEffect } from "react";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  PLANS,
  isValidPlanCode,
  getPlanByCode,
} from "../lib/plans";
import { syncStarBadgeAvailability } from "../lib/app-feature-metafields.server";
import {
  setShopPlanCode,
  getShopMonthlyUsage,
} from "../lib/shop-plans.server";
import styles from "../styles/pricing.module.css";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const usage = await getShopMonthlyUsage(session.shop);

  try {
    await syncStarBadgeAvailability(admin, usage.plan.code);
  } catch (e) {
    console.warn("Failed to sync star badge availability:", e?.message || e);
  }

  return {
    shop: session.shop,
    currentPlan: usage.plan,
    currentPlanCode: usage.plan.code,
    isLimitReached:
      usage.plan.reviewLimit !== null &&
      usage.monthlyReviewCount >= usage.plan.reviewLimit,
    reviewCount: usage.monthlyReviewCount,
    monthlyReviewCount: usage.monthlyReviewCount,
    totalReviewCount: usage.totalReviewCount,
    remainingReviews: usage.remainingReviews,
    nextResetDate: usage.nextResetDate,
    usageLabel: usage.usageLabel,
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const plan = String(formData.get("plan") || "");

  if (!isValidPlanCode(plan)) {
    return { ok: false, error: "Invalid plan code" };
  }

  await setShopPlanCode(session.shop, plan);

  try {
    await syncStarBadgeAvailability(admin, plan);
  } catch (e) {
    console.warn("Failed to sync star badge:", e?.message || e);
  }

  return { ok: true, plan };
};

export default function Pricing() {
  const {
    currentPlanCode,
    isLimitReached,
    usageLabel,
    monthlyReviewCount,
    remainingReviews,
    nextResetDate,
  } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();
  const selectedPlan =
    actionData?.error
      ? currentPlanCode
      : navigation.formData?.get("plan") || actionData?.plan || currentPlanCode;
  const currentPlan = getPlanByCode(selectedPlan);
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
        {currentPlanCode.toUpperCase().startsWith("CUSTOM") ? (
          <div className={styles.customPlanGrid}>
            <article className={`${styles.planCard} ${styles.custom} ${styles.currentPlan}`}>
              <div className={styles.planTop}>
                <span>Custom Plan</span>
                <strong>Monthly Recurring · Active</strong>
              </div>
              <div className={styles.priceRow}>
                <h3>{currentPlan.reviewLimit ? `${currentPlan.reviewLimit} Reviews` : "Custom"}</h3>
                <small>/mo (recurring)</small>
              </div>
              <p>Your store is active on a dedicated custom monthly recurring package with full access to all features.</p>
              <div className={styles.limitPill}>
                {currentPlan.reviewLimit
                  ? `${monthlyReviewCount}/${currentPlan.reviewLimit} used this month · ${remainingReviews} remaining`
                  : "Custom monthly quota"}
              </div>
              <ul>
                <li>Up to {currentPlan.reviewLimit || "custom"} reviews every month</li>
                {nextResetDate ? <li>Monthly quota resets on <strong>{nextResetDate}</strong></li> : null}
                <li>Storefront review section</li>
                <li>Review vibe storefront block</li>
                <li>Star badge widget</li>
                <li>Video reviews layout</li>
                <li>Review analytics insights</li>
                <li>Post-review discount popup</li>
                <li>Priority moderation queue</li>
                <li>Premium support</li>
              </ul>
              <div className={styles.planAction}>
                <s-button variant="primary" disabled>
                  Current plan
                </s-button>
              </div>
            </article>
          </div>
        ) : (
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
        )}

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
            <h3>Store Plan Management</h3>
            <p>
              Your store's package controls available review limits and widget
              features. Packages can be activated here or remotely via your external
              management API.
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
