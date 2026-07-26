import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import {
  DEFAULT_REVIEW_REWARD_SETTINGS,
  getReviewRewardSettings,
  saveReviewRewardSettings,
} from "../lib/app-feature-metafields.server";
import {
  cleanupExpiredReviewCoupons,
  deleteGeneratedReviewCoupon,
} from "../lib/review-reward-discounts.server";
import styles from "../styles/review-reward.module.css";

const renderRewardHeading = (heading, discountValue) =>
  String(heading || "Thank you for your review").replaceAll(
    "[[percentage]]",
    `${discountValue}%`,
  );

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  await cleanupExpiredReviewCoupons(admin, session.shop);
  const [settings, coupons, total, active, deleted] = await Promise.all([
    getReviewRewardSettings(admin),
    db.generatedCoupon.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.generatedCoupon.count({ where: { shop: session.shop } }),
    db.generatedCoupon.count({
      where: { shop: session.shop, status: "ACTIVE" },
    }),
    db.generatedCoupon.count({
      where: { shop: session.shop, status: "DELETED" },
    }),
  ]);
  return {
    coupons: coupons.map((coupon) => ({
      ...coupon,
      createdAt: coupon.createdAt.toISOString(),
      deletedAt: coupon.deletedAt?.toISOString() || null,
      expiresAt: coupon.expiresAt.toISOString(),
      updatedAt: coupon.updatedAt.toISOString(),
    })),
    settings,
    stats: { active, deleted, total },
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  if (formData.get("intent") === "deleteCoupon") {
    const couponId = String(formData.get("couponId") || "");
    try {
      await deleteGeneratedReviewCoupon(admin, session.shop, couponId);
      return { deletedCouponId: couponId, ok: true };
    } catch (error) {
      return {
        error: error.message || "Could not delete this coupon.",
        ok: false,
      };
    }
  }
  const raw = JSON.parse(String(formData.get("settings") || "{}"));
  const color = String(raw.accentColor || DEFAULT_REVIEW_REWARD_SETTINGS.accentColor);
  const redirectPath = String(raw.redirectPath || "/collections/all").trim();
  const imageUrl = String(raw.imageUrl || "").trim();
  const settings = {
    ...DEFAULT_REVIEW_REWARD_SETTINGS,
    accentColor: /^#[0-9a-f]{6}$/i.test(color) ? color : "#18B487",
    buttonLabel: String(raw.buttonLabel || "Apply now").trim().slice(0, 40),
    codePrefix: "",
    couponLifetimeDays: Math.max(
      1,
      Math.min(365, Number(raw.couponLifetimeDays) || 30),
    ),
    discountCode: String(raw.discountCode || "").trim().slice(0, 64),
    discountValue: Math.max(
      1,
      Math.min(100, Number(raw.discountValue) || 20),
    ),
    enabled: Boolean(raw.enabled),
    generateUniqueCode: Boolean(raw.generateUniqueCode),
    heading: String(raw.heading || DEFAULT_REVIEW_REWARD_SETTINGS.heading).trim().slice(0, 100),
    imageUrl: /^https?:\/\//i.test(imageUrl) ? imageUrl.slice(0, 1000) : "",
    message: String(raw.message || DEFAULT_REVIEW_REWARD_SETTINGS.message).trim().slice(0, 240),
    redirectPath: redirectPath.startsWith("/") ? redirectPath.slice(0, 300) : "/collections/all",
  };
  await saveReviewRewardSettings(admin, settings);
  return { ok: true, settings };
};

export default function ReviewReward() {
  const {
    coupons,
    settings: savedSettings,
    stats,
  } = useLoaderData();
  const fetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const [settings, setSettings] = useState(savedSettings);
  const [dirty, setDirty] = useState(false);
  const update = (key, value) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  useEffect(() => {
    if (fetcher.data?.ok) setDirty(false);
  }, [fetcher.data]);

  return (
    <s-page heading="Review reward" inlineSize="large">
      <div className={styles.pageGrid}>
        <main className={styles.settingsColumn}>
          <s-section heading="Post-review discount popup">
            <div className={styles.hero}>
              <div>
                <span>Starter plan feature</span>
                <h2>Turn every review into another purchase</h2>
                <p>
                  Thank customers immediately after a successful review and
                  reward them with a Shopify discount code.
                </p>
              </div>
              <s-badge tone="success">Available</s-badge>
            </div>

            <div className={styles.enableCard}>
              <div>
                <strong>Enable reward popup</strong>
                <p>Show the offer only after a review is submitted successfully.</p>
              </div>
              <button
                aria-checked={settings.enabled}
                aria-label="Enable reward popup"
                className={styles.switch}
                onClick={() => update("enabled", !settings.enabled)}
                role="switch"
                type="button"
              >
                <span aria-hidden="true" />
              </button>
            </div>

            <div className={styles.controlGrid}>
              <label className={`${styles.controlCard} ${styles.wideControl}`}>
                <span>Coupon mode</span>
                <strong>Generate a unique code for every review</strong>
                <div className={styles.inlineToggle}>
                  <input
                    checked={settings.generateUniqueCode}
                    onChange={(event) => update("generateUniqueCode", event.target.checked)}
                    type="checkbox"
                  />
                  <p>Each generated code can be redeemed once.</p>
                </div>
              </label>
              {settings.generateUniqueCode ? (
                <>
                  <label className={styles.controlCard}>
                    <span>Discount</span>
                    <strong>Percentage off</strong>
                    <input
                      max="100"
                      min="1"
                      onChange={(event) =>
                        update("discountValue", Number(event.target.value))
                      }
                      type="number"
                      value={settings.discountValue}
                    />
                    <small>Applied to all products for this coupon.</small>
                  </label>
                  <label className={styles.controlCard}>
                    <span>Expiration</span>
                    <strong>Auto-delete after</strong>
                    <div className={styles.numberSuffix}>
                      <input
                        max="365"
                        min="1"
                        onChange={(event) =>
                          update("couponLifetimeDays", Number(event.target.value))
                        }
                        type="number"
                        value={settings.couponLifetimeDays}
                      />
                      <span>days</span>
                    </div>
                    <small>
                      Shopify expires it on this date; the app then deletes it automatically.
                    </small>
                  </label>
                  <div className={styles.controlCard}>
                    <span>Coupon</span>
                    <strong>Random five-character code</strong>
                    <small>Example: A7K2P</small>
                  </div>
                </>
              ) : null}
              <label className={styles.controlCard}>
                <span>Content</span>
                <strong>Offer heading</strong>
                <input
                  maxLength="100"
                  onChange={(event) => update("heading", event.target.value)}
                  placeholder="Congratulations, you got [[percentage]] off"
                  value={settings.heading}
                />
                <small>
                  Use <code>[[percentage]]</code> to insert the current discount, including %.
                </small>
              </label>
              <label className={styles.controlCard}>
                <span>Discount</span>
                <strong>{settings.generateUniqueCode ? "Fallback discount code" : "Shopify discount code"}</strong>
                <input
                  maxLength="64"
                  onChange={(event) => update("discountCode", event.target.value)}
                  placeholder="Example: THANKYOU20"
                  value={settings.discountCode}
                />
                <small>
                  {settings.generateUniqueCode
                    ? "Used only if Shopify cannot generate a unique code."
                    : "Create this same code in Shopify Discounts."}
                </small>
              </label>
              <label className={`${styles.controlCard} ${styles.wideControl}`}>
                <span>Content</span>
                <strong>Thank-you message</strong>
                <textarea
                  maxLength="240"
                  onChange={(event) => update("message", event.target.value)}
                  rows="3"
                  value={settings.message}
                />
              </label>
              <label className={`${styles.controlCard} ${styles.wideControl}`}>
                <span>Media</span>
                <strong>Banner image URL</strong>
                <input
                  onChange={(event) => update("imageUrl", event.target.value)}
                  placeholder="https://cdn.shopify.com/..."
                  type="url"
                  value={settings.imageUrl}
                />
                <small>Optional. Use a Shopify Files or CDN image URL.</small>
              </label>
              <label className={styles.controlCard}>
                <span>Button</span>
                <strong>Redirect after applying</strong>
                <input
                  onChange={(event) => update("redirectPath", event.target.value)}
                  placeholder="/collections/all"
                  value={settings.redirectPath}
                />
              </label>
              <label className={styles.controlCard}>
                <span>Color</span>
                <strong>Accent color</strong>
                <div className={styles.colorRow}>
                  <input
                    onChange={(event) => update("accentColor", event.target.value)}
                    type="color"
                    value={settings.accentColor}
                  />
                  <small>{settings.accentColor}</small>
                </div>
              </label>
            </div>

            <div className={styles.saveBar}>
              <div>
                <strong>Reward popup settings</strong>
                <p>
                  {dirty
                    ? "You have unsaved changes."
                    : fetcher.data?.ok
                      ? "Saved successfully. The storefront popup is updated."
                      : "Settings are saved."}
                </p>
              </div>
              <s-button
                disabled={!dirty || fetcher.state !== "idle"}
                loading={fetcher.state !== "idle"}
                onClick={() =>
                  fetcher.submit(
                    { settings: JSON.stringify(settings) },
                    { method: "post" },
                  )
                }
                variant="primary"
              >
                Save settings
              </s-button>
            </div>
          </s-section>

          <s-section heading="Generated coupons">
            <div className={styles.statsGrid}>
              <div>
                <span>Total generated</span>
                <strong>{stats.total}</strong>
              </div>
              <div>
                <span>Active</span>
                <strong>{stats.active}</strong>
              </div>
              <div>
                <span>Deleted</span>
                <strong>{stats.deleted}</strong>
              </div>
            </div>

            {deleteFetcher.data?.error ? (
              <div className={styles.deleteError}>{deleteFetcher.data.error}</div>
            ) : null}

            {coupons.length ? (
              <div className={styles.couponTableWrap}>
                <table className={styles.couponTable}>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Discount</th>
                      <th>Created</th>
                      <th>Expires</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coupons.map((coupon) => {
                      const expired =
                        coupon.status === "ACTIVE" &&
                        new Date(coupon.expiresAt).getTime() <= Date.now();
                      const status = expired ? "EXPIRED" : coupon.status;
                      const statusClass =
                        styles[`status${status.replace("_", "")}`] || "";
                      return (
                        <tr key={coupon.id}>
                          <td><code>{coupon.code}</code></td>
                          <td>{coupon.percentage}%</td>
                          <td>{formatDate(coupon.createdAt)}</td>
                          <td>{formatDate(coupon.expiresAt)}</td>
                          <td>
                            <span
                              className={`${styles.statusPill} ${statusClass}`}
                              title={coupon.deletionError || undefined}
                            >
                              {status.replace("_", " ")}
                            </span>
                          </td>
                          <td>
                            {coupon.status === "DELETED" ? (
                              <span className={styles.deletedLabel}>Deleted</span>
                            ) : (
                              <button
                                className={styles.deleteCouponButton}
                                disabled={
                                  deleteFetcher.state !== "idle" &&
                                  deleteFetcher.formData?.get("couponId") === coupon.id
                                }
                                onClick={() => {
                                  if (!window.confirm(`Delete coupon ${coupon.code}?`)) return;
                                  deleteFetcher.submit(
                                    {
                                      couponId: coupon.id,
                                      intent: "deleteCoupon",
                                    },
                                    { method: "post" },
                                  );
                                }}
                                type="button"
                              >
                                {deleteFetcher.state !== "idle" &&
                                deleteFetcher.formData?.get("couponId") === coupon.id
                                  ? "Deleting…"
                                  : "Delete"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={styles.emptyCoupons}>
                Generated coupons will appear here after customers submit reviews.
              </div>
            )}
          </s-section>
        </main>

        <aside className={styles.previewColumn}>
          <s-section heading="Live preview">
            <div className={styles.previewShell}>
              <span className={styles.previewState}>
                {settings.enabled ? "Popup enabled" : "Popup disabled"}
              </span>
              <div className={styles.rewardPreview}>
                {settings.imageUrl ? (
                  <img alt="" src={settings.imageUrl} />
                ) : (
                  <div className={styles.imageFallback}>THANK YOU</div>
                )}
                <div className={styles.previewContent}>
                  <h3>{renderRewardHeading(settings.heading, settings.discountValue)}</h3>
                  <p>{settings.message}</p>
                  <span>Your coupon code</span>
                  <button style={{ background: settings.accentColor }} type="button">
                    {settings.generateUniqueCode
                      ? "A7K2P"
                      : settings.discountCode || "THANKYOU20"}
                  </button>
                </div>
              </div>
            </div>
          </s-section>
        </aside>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

const formatDate = (value) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
