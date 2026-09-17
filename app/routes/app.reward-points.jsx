import { useState, useEffect } from "react";
import { useLoaderData, useFetcher, useNavigation, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  getRewardPointsData,
  saveRewardPointSettings,
  adjustCustomerPoints,
  deleteRedeemedPointCoupon,
  cleanupExpiredRewardCoupons,
} from "../lib/reward-points.server";
import styles from "../styles/reward-points.module.css";

const DEFAULT_REWARD_POINT_SETTINGS = {
  enabled: true,
  pointsPerDollar: 1,
  minSpend: 0,
  pointUnitName: "Points",
  redemptionTiers: [
    { points: 100, type: "FIXED_AMOUNT", value: 5, label: "$5 off" },
    { points: 200, type: "FIXED_AMOUNT", value: 10, label: "$10 off" },
    { points: 500, type: "PERCENTAGE", value: 25, label: "25% off" },
  ],
  couponLifetimeDays: 30,
  codePrefix: "RP-",
};

const formatDate = (date) => {
  if (!date) return "—";
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(d);
  } catch (_) {
    return "—";
  }
};

export const loader = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    try {
      await cleanupExpiredRewardCoupons(admin, session.shop);
    } catch (e) {
      console.warn("Coupon cleanup error:", e?.message);
    }

    const data = await getRewardPointsData(session.shop);
    return {
      shop: session.shop,
      ...data,
    };
  } catch (error) {
    console.error("Loader error in reward-points:", error);
    return {
      shop: "",
      settings: DEFAULT_REWARD_POINT_SETTINGS,
      stats: {
        totalCustomers: 0,
        activePointsBalance: 0,
        totalPointsEarned: 0,
        totalPointsRedeemed: 0,
        totalSpend: 0,
      },
      customerAccounts: [],
      recentCoupons: [],
      recentTransactions: [],
      error: error?.message || "Failed to load data",
    };
  }
};

export const action = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "saveSettings") {
      try {
        const rawSettings = JSON.parse(String(formData.get("settings") || "{}"));
        const updated = await saveRewardPointSettings(session.shop, rawSettings);
        return { ok: true, message: "Settings saved successfully", settings: updated };
      } catch (error) {
        return { ok: false, error: error?.message || "Failed to save settings" };
      }
    }

    if (intent === "adjustPoints") {
      const customerEmail = String(formData.get("customerEmail") || "");
      const points = Number(formData.get("points") || 0);
      const description = String(formData.get("description") || "");
      const customerName = String(formData.get("customerName") || "");

      try {
        const account = await adjustCustomerPoints(
          session.shop,
          customerEmail,
          points,
          description,
          customerName,
        );
        return { ok: true, message: `Points updated for ${customerEmail}`, account };
      } catch (error) {
        return { ok: false, error: error?.message || "Failed to adjust points" };
      }
    }

    if (intent === "deleteCoupon") {
      const couponId = String(formData.get("couponId") || "");
      try {
        await deleteRedeemedPointCoupon(admin, session.shop, couponId);
        return { ok: true, deletedCouponId: couponId, message: "Coupon deleted" };
      } catch (error) {
        return { ok: false, error: error?.message || "Failed to delete coupon" };
      }
    }

    return { ok: true };
  } catch (error) {
    console.error("Action error in reward-points:", error);
    return { ok: false, error: error?.message || "Server action failed" };
  }
};

export default function RewardPoints() {
  const loaderData = useLoaderData() || {};
  const initialSettings = loaderData.settings || DEFAULT_REWARD_POINT_SETTINGS;
  const stats = loaderData.stats || {};
  const customerAccounts = Array.isArray(loaderData.customerAccounts) ? loaderData.customerAccounts : [];
  const recentCoupons = Array.isArray(loaderData.recentCoupons) ? loaderData.recentCoupons : [];
  const recentTransactions = Array.isArray(loaderData.recentTransactions) ? loaderData.recentTransactions : [];

  const shopify = useAppBridge();
  const fetcher = useFetcher();
  const navigation = useNavigation();

  const [activeTab, setActiveTab] = useState("rules");
  const [settings, setSettings] = useState(initialSettings);
  const [customerSearch, setCustomerSearch] = useState("");
  const [adjustModal, setAdjustModal] = useState({ open: false, email: "", name: "", points: 50, note: "" });

  const isSaving = fetcher.state === "submitting" && fetcher.formData?.get("intent") === "saveSettings";

  useEffect(() => {
    if (fetcher.data?.ok) {
      if (fetcher.data.settings) {
        setSettings(fetcher.data.settings);
      }
      if (fetcher.data.message) {
        try {
          shopify?.toast?.show?.(fetcher.data.message);
        } catch (_) {}
      }
      if (adjustModal.open) {
        setAdjustModal({ open: false, email: "", name: "", points: 50, note: "" });
      }
    } else if (fetcher.data?.error) {
      try {
        shopify?.toast?.show?.(fetcher.data.error, { isError: true });
      } catch (_) {}
    }
  }, [fetcher.data, shopify, adjustModal.open]);

  const handleSettingChange = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleTierChange = (index, field, value) => {
    const currentTiers = Array.isArray(settings?.redemptionTiers) ? settings.redemptionTiers : DEFAULT_REWARD_POINT_SETTINGS.redemptionTiers;
    const updatedTiers = [...currentTiers];
    updatedTiers[index] = { ...updatedTiers[index], [field]: value };
    
    // Auto-update label
    if (field === "type" || field === "value") {
      const type = field === "type" ? value : updatedTiers[index].type;
      const val = field === "value" ? value : updatedTiers[index].value;
      updatedTiers[index].label = type === "PERCENTAGE" ? `${val}% off` : `$${val} off`;
    }

    setSettings((prev) => ({ ...prev, redemptionTiers: updatedTiers }));
  };

  const addTier = () => {
    const currentTiers = Array.isArray(settings?.redemptionTiers) ? settings.redemptionTiers : DEFAULT_REWARD_POINT_SETTINGS.redemptionTiers;
    const newTier = {
      points: 100,
      type: "FIXED_AMOUNT",
      value: 5,
      label: "$5 off",
    };
    setSettings((prev) => ({
      ...prev,
      redemptionTiers: [...currentTiers, newTier],
    }));
  };

  const removeTier = (index) => {
    const currentTiers = Array.isArray(settings?.redemptionTiers) ? settings.redemptionTiers : DEFAULT_REWARD_POINT_SETTINGS.redemptionTiers;
    setSettings((prev) => ({
      ...prev,
      redemptionTiers: currentTiers.filter((_, i) => i !== index),
    }));
  };

  const handleSaveSettings = () => {
    fetcher.submit(
      {
        intent: "saveSettings",
        settings: JSON.stringify(settings || DEFAULT_REWARD_POINT_SETTINGS),
      },
      { method: "post" },
    );
  };

  const filteredCustomers = customerAccounts.filter((acc) => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      acc.customerEmail.toLowerCase().includes(query) ||
      (acc.customerName && acc.customerName.toLowerCase().includes(query))
    );
  });

  return (
    <s-page heading="Reward Points" inlineSize="large">
      <div className={styles.pageWrap}>
        {/* Hero Loyalty Banner */}
        <div className={styles.heroCard}>
          <div className={styles.heroContent}>
            <span className={styles.heroBadge}>Loyalty & Rewards</span>
            <h2>Purchase Reward Points & Coupon Redemption</h2>
            <p>
              Automatically reward your customers with points for every purchase. Customers can accumulate
              points over time and redeem them for customized discount coupons at checkout.
            </p>
          </div>
          <div className={styles.heroAction}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "#ffffff", fontWeight: "700" }}>
              <input
                type="checkbox"
                checked={Boolean(settings?.enabled)}
                onChange={(e) => handleSettingChange("enabled", e.target.checked)}
                style={{ width: "18px", height: "18px", accentColor: "#10b981", cursor: "pointer" }}
              />
              {settings?.enabled ? "Reward Points Active" : "Reward Points Disabled"}
            </label>
          </div>
        </div>

        {/* Feedback Banners */}
        {fetcher.data?.message && (
          <div style={{ padding: "12px 16px", borderRadius: "8px", background: "#d1fae5", border: "1px solid #10b981", color: "#065f46", fontWeight: "600", fontSize: "14px" }}>
            ✓ {fetcher.data.message}
          </div>
        )}
        {fetcher.data?.error && (
          <div style={{ padding: "12px 16px", borderRadius: "8px", background: "#fee2e2", border: "1px solid #ef4444", color: "#991b1b", fontWeight: "600", fontSize: "14px" }}>
            ✕ {fetcher.data.error}
          </div>
        )}

        {/* Stats Grid */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Active Point Balance</span>
            <div className={styles.statValue}>{(stats.activePointsBalance || 0).toLocaleString()}</div>
            <span className={styles.statSub}>Circulating points across customers</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Total Points Issued</span>
            <div className={styles.statValue}>{(stats.totalPointsEarned || 0).toLocaleString()}</div>
            <span className={styles.statSub}>Earned from store purchases</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Points Redeemed</span>
            <div className={styles.statValue}>{(stats.totalPointsRedeemed || 0).toLocaleString()}</div>
            <span className={styles.statSub}>Converted to discount coupons</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>Enrolled Customers</span>
            <div className={styles.statValue}>{(stats.totalCustomers || 0).toLocaleString()}</div>
            <span className={styles.statSub}>Customers with reward accounts</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className={styles.tabNav}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "rules" ? styles.activeTab : ""}`}
            onClick={() => setActiveTab("rules")}
          >
            Earning & Redemption Rules
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "customers" ? styles.activeTab : ""}`}
            onClick={() => setActiveTab("customers")}
          >
            Customer Balances <span className={styles.tabPill}>{customerAccounts.length}</span>
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "coupons" ? styles.activeTab : ""}`}
            onClick={() => setActiveTab("coupons")}
          >
            Redeemed Coupons <span className={styles.tabPill}>{recentCoupons.length}</span>
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === "transactions" ? styles.activeTab : ""}`}
            onClick={() => setActiveTab("transactions")}
          >
            Ledger History
          </button>
        </div>

        {/* TAB 1: RULES & SETTINGS */}
        {activeTab === "rules" && (
          <div className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <h3>Purchase Point Earning Rules</h3>
              <p>Configure how many points customers earn when making a purchase on your store.</p>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Points Earned per $1 Spent</label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={settings.pointsPerDollar}
                  onChange={(e) => handleSettingChange("pointsPerDollar", Number(e.target.value))}
                />
                <span className={styles.formHelp}>Example: 1 means a $50 purchase awards 50 points.</span>
              </div>

              <div className={styles.formGroup}>
                <label>Minimum Order Spend Threshold ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settings.minSpend}
                  onChange={(e) => handleSettingChange("minSpend", Number(e.target.value))}
                />
                <span className={styles.formHelp}>Orders below this amount will not earn reward points (0 = all orders earn).</span>
              </div>

              <div className={styles.formGroup}>
                <label>Point Unit Name</label>
                <input
                  type="text"
                  value={settings.pointUnitName}
                  onChange={(e) => handleSettingChange("pointUnitName", e.target.value)}
                  placeholder="Points, Stars, Coins..."
                />
                <span className={styles.formHelp}>Display name for your loyalty points.</span>
              </div>

              <div className={styles.formGroup}>
                <label>Coupon Code Prefix</label>
                <input
                  type="text"
                  value={settings.codePrefix}
                  onChange={(e) => handleSettingChange("codePrefix", e.target.value)}
                  placeholder="RP-, REWARD-"
                />
                <span className={styles.formHelp}>Prefix applied to generated Shopify discount codes.</span>
              </div>

              <div className={styles.formGroup}>
                <label>Coupon Expiration (Days)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={settings.couponLifetimeDays}
                  onChange={(e) => handleSettingChange("couponLifetimeDays", Number(e.target.value))}
                />
                <span className={styles.formHelp}>Number of days the redeemed discount code remains valid.</span>
              </div>
            </div>

            <div style={{ marginTop: "28px" }}>
              <div className={styles.sectionHeader}>
                <h3>Point Redemption Tiers</h3>
                <p>Define the coupon discount options available when customers redeem points.</p>
              </div>

              <div className={styles.tiersList}>
                {settings.redemptionTiers.map((tier, index) => (
                  <div key={index} className={styles.tierRow}>
                    <div className={styles.tierInputs}>
                      <div>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b" }}>Points Required</span>
                        <input
                          type="number"
                          min="1"
                          style={{ width: "110px", display: "block", marginTop: "2px" }}
                          value={tier.points}
                          onChange={(e) => handleTierChange(index, "points", Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b" }}>Discount Type</span>
                        <select
                          style={{ display: "block", marginTop: "2px" }}
                          value={tier.type}
                          onChange={(e) => handleTierChange(index, "type", e.target.value)}
                        >
                          <option value="FIXED_AMOUNT">Fixed Amount ($)</option>
                          <option value="PERCENTAGE">Percentage (%)</option>
                        </select>
                      </div>
                      <div>
                        <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b" }}>Discount Value</span>
                        <input
                          type="number"
                          min="1"
                          style={{ width: "90px", display: "block", marginTop: "2px" }}
                          value={tier.value}
                          onChange={(e) => handleTierChange(index, "value", Number(e.target.value))}
                        />
                      </div>
                      <div style={{ marginLeft: "10px", paddingTop: "14px" }}>
                        <strong style={{ color: "#065f46" }}>➔ {tier.label || `${tier.points} pts for discount`}</strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={styles.removeTierBtn}
                      onClick={() => removeTier(index)}
                      disabled={settings.redemptionTiers.length <= 1}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <button type="button" className={styles.addTierBtn} onClick={addTier}>
                + Add Redemption Tier
              </button>
            </div>

            <div className={styles.saveBar}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleSaveSettings}
                disabled={isSaving}
              >
                {isSaving ? "Saving Settings..." : "Save Reward Rules"}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: CUSTOMER BALANCES */}
        {activeTab === "customers" && (
          <div className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <h3>Customer Loyalty Accounts</h3>
              <p>View customer point balances, total spend, and manually adjust points when needed.</p>
            </div>

            <div className={styles.searchBar}>
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Search by customer email or name..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
            </div>

            {filteredCustomers.length === 0 ? (
              <div className={styles.emptyState}>
                <h4>No customer accounts found</h4>
                <p>Customers will automatically appear here as they complete orders on your store.</p>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.customTable}>
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Points Balance</th>
                      <th>Total Earned</th>
                      <th>Total Redeemed</th>
                      <th>Total Spend</th>
                      <th>Orders</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCustomers.map((acc) => (
                      <tr key={acc.id}>
                        <td>
                          <strong>{acc.customerName || "Customer"}</strong>
                          <div style={{ color: "#64748b", fontSize: "12px" }}>{acc.customerEmail}</div>
                        </td>
                        <td>
                          <span className={styles.pointsBadge}>{acc.pointsBalance.toLocaleString()} pts</span>
                        </td>
                        <td>{acc.totalPointsEarned.toLocaleString()}</td>
                        <td>{acc.totalPointsRedeemed.toLocaleString()}</td>
                        <td>${(acc.totalSpend || 0).toFixed(2)}</td>
                        <td>{acc.orderCount || 0}</td>
                        <td>
                          <button
                            type="button"
                            className={styles.adjustBtn}
                            onClick={() =>
                              setAdjustModal({
                                open: true,
                                email: acc.customerEmail,
                                name: acc.customerName || "Customer",
                                points: 50,
                                note: "Customer bonus adjustment",
                              })
                            }
                          >
                            +/- Adjust
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: REDEEMED COUPONS */}
        {activeTab === "coupons" && (
          <div className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <h3>Redeemed Discount Coupons</h3>
              <p>History of all discount codes created in Shopify via customer point redemption.</p>
            </div>

            {recentCoupons.length === 0 ? (
              <div className={styles.emptyState}>
                <h4>No redeemed coupons yet</h4>
                <p>When customers convert points into discount codes, they will be listed here.</p>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.customTable}>
                  <thead>
                    <tr>
                      <th>Coupon Code</th>
                      <th>Customer</th>
                      <th>Points Spent</th>
                      <th>Discount</th>
                      <th>Status</th>
                      <th>Expires At</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCoupons.map((coupon) => (
                      <tr key={coupon.id}>
                        <td>
                          <strong style={{ letterSpacing: "0.05em", color: "#065f46" }}>{coupon.code}</strong>
                        </td>
                        <td>{coupon.customerEmail}</td>
                        <td>{coupon.pointsSpent} pts</td>
                        <td>
                          {coupon.discountType === "PERCENTAGE"
                            ? `${coupon.discountValue}% off`
                            : `$${coupon.discountValue} off`}
                        </td>
                        <td>
                          <span
                            className={`${styles.statusPill} ${
                              coupon.status === "ACTIVE"
                                ? styles.statusActive
                                : coupon.status === "EXPIRED"
                                ? styles.statusExpired
                                : styles.statusUsed
                            }`}
                          >
                            {coupon.status}
                          </span>
                        </td>
                        <td>{formatDate(coupon.expiresAt)}</td>
                        <td>{formatDate(coupon.createdAt)}</td>
                        <td>
                          <fetcher.Form method="post" style={{ display: "inline" }}>
                            <input type="hidden" name="intent" value="deleteCoupon" />
                            <input type="hidden" name="couponId" value={coupon.id} />
                            <button
                              type="submit"
                              className={styles.deleteBtn}
                              disabled={fetcher.state === "submitting"}
                            >
                              Delete
                            </button>
                          </fetcher.Form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: TRANSACTION LEDGER */}
        {activeTab === "transactions" && (
          <div className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <h3>Points Activity Ledger</h3>
              <p>Audit log of points earned from purchases, redeemed for coupons, or adjusted by merchant.</p>
            </div>

            {recentTransactions.length === 0 ? (
              <div className={styles.emptyState}>
                <h4>No transactions recorded yet</h4>
                <p>Recent order reward points and redemptions will appear here.</p>
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.customTable}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Customer</th>
                      <th>Type</th>
                      <th>Points</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>{formatDate(tx.createdAt)}</td>
                        <td>{tx.customerEmail}</td>
                        <td>
                          <span className={styles.statusPill} style={{ background: "#f1f5f9", color: "#334155" }}>
                            {tx.type}
                          </span>
                        </td>
                        <td>
                          <strong style={{ color: tx.points > 0 ? "#059669" : "#dc2626" }}>
                            {tx.points > 0 ? `+${tx.points}` : tx.points}
                          </strong>
                        </td>
                        <td>{tx.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ADJUST POINTS MODAL */}
        {adjustModal.open && (
          <div className={styles.modalBackdrop}>
            <div className={styles.modalBox}>
              <div className={styles.modalHeader}>
                <h3>Adjust Customer Points</h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setAdjustModal({ ...adjustModal, open: false })}
                >
                  ✕
                </button>
              </div>

              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="adjustPoints" />
                <input type="hidden" name="customerEmail" value={adjustModal.email} />
                <input type="hidden" name="customerName" value={adjustModal.name} />

                <div style={{ marginBottom: "14px" }}>
                  <span style={{ fontSize: "13px", color: "#64748b" }}>Customer: </span>
                  <strong>{adjustModal.email}</strong>
                </div>

                <div className={styles.formGroup} style={{ marginBottom: "14px" }}>
                  <label>Points to Add or Deduct</label>
                  <input
                    type="number"
                    name="points"
                    value={adjustModal.points}
                    onChange={(e) => setAdjustModal({ ...adjustModal, points: Number(e.target.value) })}
                    placeholder="e.g. 50 or -50"
                    required
                  />
                  <span className={styles.formHelp}>Use positive number (e.g. 100) to add, or negative (e.g. -50) to deduct.</span>
                </div>

                <div className={styles.formGroup}>
                  <label>Adjustment Note / Reason</label>
                  <input
                    type="text"
                    name="description"
                    value={adjustModal.note}
                    onChange={(e) => setAdjustModal({ ...adjustModal, note: e.target.value })}
                    placeholder="Customer bonus, goodwill adjustment..."
                  />
                </div>

                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setAdjustModal({ ...adjustModal, open: false })}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.primaryBtn}
                    disabled={fetcher.state === "submitting"}
                  >
                    {fetcher.state === "submitting" ? "Applying..." : "Apply Adjustment"}
                  </button>
                </div>
              </fetcher.Form>
            </div>
          </div>
        )}
      </div>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
