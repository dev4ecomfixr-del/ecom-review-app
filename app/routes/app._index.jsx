import { useState, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DEFAULT_PLAN, getPlanUsageLabel } from "../lib/plans";
import { getShopMonthlyUsage } from "../lib/shop-plans.server";
import styles from "../styles/review-dashboard.module.css";

const formatDate = (date) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));

const getRatingStars = (rating) =>
  `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;

const getCustomerInitials = (name) => {
  const parts = String(name || "Customer").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "C";
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const reviewDelegate = db.review;

  if (!reviewDelegate) {
    return {
      shop: session.shop,
      reviews: [],
      needsPrismaRestart: true,
      stats: {
        totalReviews: 0,
        publishedReviews: 0,
        repliedReviews: 0,
        averageRating: 0,
      },
      plan: DEFAULT_PLAN,
      planUsageLabel: getPlanUsageLabel(DEFAULT_PLAN, 0),
      usage: null,
    };
  }

  const [
    reviews,
    totalReviews,
    publishedReviews,
    repliedReviews,
    averageRating,
    usage,
  ] = await Promise.all([
    reviewDelegate.findMany({
      where: { shop: session.shop },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    reviewDelegate.count({ where: { shop: session.shop } }),
    reviewDelegate.count({
      where: { shop: session.shop, status: "PUBLISHED" },
    }),
    reviewDelegate.count({
      where: { shop: session.shop, merchantReply: { not: null } },
    }),
    reviewDelegate.aggregate({
      where: { shop: session.shop, status: "PUBLISHED" },
      _avg: { rating: true },
    }),
    getShopMonthlyUsage(session.shop),
  ]);

  return {
    shop: session.shop,
    reviews,
    stats: {
      totalReviews: totalReviews || 0,
      publishedReviews: publishedReviews || 0,
      repliedReviews: repliedReviews || 0,
      averageRating: averageRating?._avg?.rating || 0,
    },
    plan: usage.plan,
    planUsageLabel: usage.usageLabel,
    usage,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const reviewDelegate = db.review;
  const formData = await request.formData();
  const intent = formData.get("intent");
  const reviewId = formData.get("reviewId");

  if (intent === "save-reply" && reviewId && reviewDelegate) {
    const merchantReply = String(formData.get("merchantReply") || "").trim().slice(0, 1000);
    await reviewDelegate.updateMany({
      where: { id: String(reviewId), shop: session.shop },
      data: {
        merchantReply: merchantReply || null,
        repliedAt: merchantReply ? new Date() : null,
      },
    });
    return { ok: true, reviewId, merchantReply };
  }

  return { ok: true };
};

export default function Dashboard() {
  const { reviews, stats, needsPrismaRestart, plan, planUsageLabel, usage } =
    useLoaderData();
  const fetcher = useFetcher();
  const [editingReplyId, setEditingReplyId] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [productSearch, setProductSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");

  useEffect(() => {
    if (fetcher.data?.ok && fetcher.state === "idle") {
      setEditingReplyId(null);
    }
  }, [fetcher.data, fetcher.state]);

  const totalReviewsCount = stats?.totalReviews || 0;
  const repliedReviewsCount = stats?.repliedReviews || 0;
  const averageRating = Number(stats?.averageRating || 0).toFixed(1);
  const latestReview = reviews?.[0];
  const remainingReviews =
    usage?.remainingReviews !== undefined
      ? usage.remainingReviews
      : plan?.reviewLimit === null
      ? null
      : Math.max((plan?.reviewLimit || 0) - totalReviewsCount, 0);
  const chartValues = [
    {
      color: "#10b981",
      label: "Replied",
      value: repliedReviewsCount,
    },
    {
      color: "#dbe4e0",
      label: "Awaiting reply",
      value: Math.max(totalReviewsCount - repliedReviewsCount, 0),
    },
  ];
  let chartOffset = 0;
  const chartSegments = chartValues.map((segment) => {
    const percent = stats.totalReviews
      ? (segment.value / stats.totalReviews) * 100
      : 0;
    const segmentWithOffset = {
      ...segment,
      offset: chartOffset,
      percent,
    };

    chartOffset += percent;

    return segmentWithOffset;
  });
  const chartStops = stats.totalReviews
    ? chartSegments
        .map((segment) => {
          const start = segment.offset.toFixed(2);
          const end = (segment.offset + segment.percent).toFixed(2);

          return `${segment.color} ${start}% ${end}%`;
        })
        .join(", ")
    : "#eef2f7 0% 100%";
  const metricCards = [
    {
      label: "Total reviews",
      value: stats.totalReviews,
      detail: "All submissions",
      tone: "coral",
    },
    {
      label: "Published",
      value: stats.publishedReviews,
      detail: "Visible on storefront",
      tone: "emerald",
    },
    {
      label: "Store replies",
      value: stats.repliedReviews,
      detail: "Public responses",
      tone: "sky",
    },
    {
      label: "Average rating",
      value: averageRating,
      detail: "Across published reviews",
      tone: "gold",
    },
  ];
  const getReviewProductKey = (review) =>
    review.productId || review.productHandle || review.productTitle || "storewide";
  const getReviewProductLabel = (review) =>
    review.productTitle || review.productHandle || "Storewide";
  const productFilterMap = new Map();
  reviews.forEach((review) => {
    const key = getReviewProductKey(review);
    const current = productFilterMap.get(key);
    productFilterMap.set(key, {
      count: (current?.count || 0) + 1,
      key,
      label: current?.label || getReviewProductLabel(review),
    });
  });
  const productFilters = Array.from(productFilterMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  const normalizedProductSearch = productSearch.trim().toLowerCase();
  const visibleProductFilters = normalizedProductSearch
    ? productFilters.filter((product) =>
        product.label.toLowerCase().includes(normalizedProductSearch),
      )
    : productFilters;
  const filteredReviews = reviews
    .filter((review) =>
      selectedProduct === "all"
        ? true
        : getReviewProductKey(review) === selectedProduct,
    )
    .filter((review) =>
      normalizedProductSearch
        ? getReviewProductLabel(review).toLowerCase().includes(normalizedProductSearch)
        : true,
    )
    .filter((review) =>
      ratingFilter === "all" ? true : review.rating === Number(ratingFilter),
    )
    .sort((a, b) => {
      if (sortOrder === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
      if (sortOrder === "highest") return b.rating - a.rating;
      if (sortOrder === "lowest") return a.rating - b.rating;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  const hasActiveReviewFilters =
    selectedProduct !== "all" ||
    productSearch.trim() ||
    ratingFilter !== "all" ||
    sortOrder !== "newest";

  return (
    <s-page heading="Dashboard" inlineSize="large">
      <s-button slot="primary-action" href="/app" variant="primary">
        Refresh
      </s-button>

      <div className={styles.dashboardLayout}>
        <main className={styles.dashboardMain}>
          <s-section heading="Overview">
        <div className={styles.overview}>
          {needsPrismaRestart && (
            <s-banner tone="warning">
              Prisma was regenerated. Restart <code>shopify app dev</code> once
              so the dashboard can load the Review table.
            </s-banner>
          )}

          <div className={styles.heroPanel}>
            <div>
              <p className={styles.eyebrow}>Customer Review Management</p>
              <h2>Build Trust Through Authentic Reviews</h2>
              <p>
                Showcase genuine customer feedback, strengthen buyer
                confidence, and deliver a seamless review experience across
                your storefront.
              </p>
              <div className={styles.heroMeta}>
                <span>Storefront-Ready Reviews</span>
                <span>Trust-Building Insights</span>
              </div>
            </div>
            <div className={styles.heroScore}>
              <small>Average Customer Rating</small>
              <span>{averageRating}</span>
              <strong>★★★★★</strong>
            </div>
          </div>

          <div className={styles.analyticsGrid}>
            <div className={styles.metricGrid}>
              {metricCards.map((card) => (
                <div
                  className={`${styles.metricCard} ${styles[card.tone]}`}
                  key={card.label}
                >
                  <div className={styles.metricTopline}>
                    <span>{card.label}</span>
                    <span className={styles.metricDot} />
                  </div>
                  <strong>{card.value}</strong>
                  <p>{card.detail}</p>
                </div>
              ))}
            </div>

            <div className={styles.pieCard}>
              <div>
                <span className={styles.pieEyebrow}>Engagement</span>
                <h3>Reply coverage</h3>
              </div>
              <div className={styles.pieChartWrap}>
                <div
                  className={styles.pieChart}
                  style={{ "--chart-stops": chartStops }}
                />
                <div className={styles.pieCenter}>
                  <strong>{stats.totalReviews}</strong>
                  <span>reviews</span>
                </div>
              </div>
              <div className={styles.pieLegend}>
                {chartSegments.map((segment) => (
                  <div key={segment.label}>
                    <span style={{ background: segment.color }} />
                    <p>
                      {segment.label}
                      <strong>{segment.value}</strong>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
          </s-section>

          <s-section heading="Latest reviews">
        {reviews.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>★</div>
            <div>
              <h3>No reviews yet</h3>
              <p>
                Add the Review section to a product template. New customer
                reviews will appear here automatically as soon as they are
                submitted.
              </p>
            </div>
          </div>
        ) : (
          <div className={styles.reviewList}>
            <div className={styles.reviewListHeader}>
              <div className={styles.reviewInboxSummary}>
                <span className={styles.reviewInboxIcon}>★</span>
                <div>
                  <span className={styles.reviewInboxEyebrow}>Customer feedback</span>
                  <h3>Review inbox</h3>
                  <p>
                    {hasActiveReviewFilters
                      ? `${filteredReviews.length} matching reviews`
                      : `${stats.totalReviews} reviews across your store`}
                  </p>
                </div>
              </div>
              <span>Normal reviews publish automatically</span>
            </div>
            <div className={styles.productFilterPanel}>
              <div className={styles.reviewFilterControls}>
                <label className={styles.productSearchField}>
                  <span>Search product</span>
                  <div>
                    <span aria-hidden="true">⌕</span>
                    <input
                      onChange={(event) => {
                        setProductSearch(event.target.value);
                        setSelectedProduct("all");
                      }}
                      placeholder="Search by product name"
                      type="search"
                      value={productSearch}
                    />
                  </div>
                </label>
                <label>
                  <span>Rating</span>
                  <select
                    onChange={(event) => setRatingFilter(event.target.value)}
                    value={ratingFilter}
                  >
                    <option value="all">All ratings</option>
                    <option value="5">5 stars</option>
                    <option value="4">4 stars</option>
                    <option value="3">3 stars</option>
                    <option value="2">2 stars</option>
                    <option value="1">1 star</option>
                  </select>
                </label>
                <label>
                  <span>Sort</span>
                  <select
                    onChange={(event) => setSortOrder(event.target.value)}
                    value={sortOrder}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="highest">Highest rating</option>
                    <option value="lowest">Lowest rating</option>
                  </select>
                </label>
              </div>
              <span className={styles.productFilterLabel}>Browse by product</span>
              <div className={styles.productFilterBar} aria-label="Filter reviews by product">
                <button
                  className={selectedProduct === "all" ? styles.activeProductFilter : ""}
                  onClick={() => setSelectedProduct("all")}
                  type="button"
                >
                  All products <span>{reviews.length}</span>
                </button>
                {visibleProductFilters.map((product) => (
                  <button
                    className={selectedProduct === product.key ? styles.activeProductFilter : ""}
                    key={product.key}
                    onClick={() => setSelectedProduct(product.key)}
                    title={product.label}
                    type="button"
                  >
                    {product.label} <span>{product.count}</span>
                  </button>
                ))}
              </div>
              <div className={styles.filterResults}>
                <span>
                  Showing <strong>{filteredReviews.length}</strong> of {reviews.length} reviews
                </span>
                {hasActiveReviewFilters ? (
                  <button
                    onClick={() => {
                      setSelectedProduct("all");
                      setProductSearch("");
                      setRatingFilter("all");
                      setSortOrder("newest");
                    }}
                    type="button"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            </div>
            {filteredReviews.length ? (
            <div className={styles.reviewTable}>
              <div className={styles.reviewTableHeader} aria-hidden="true">
                <span>Review</span>
                <span>Product</span>
                <span>Customer</span>
                <span>Status</span>
                <span />
              </div>
              {filteredReviews.map((review) => (
                <details className={styles.reviewTableRow} key={review.id}>
                  <summary>
                    <div className={styles.tableReviewCell}>
                      <strong>{review.title || "Untitled review"}</strong>
                      <span className={styles.compactStars}>
                        {getRatingStars(review.rating)} <small>{review.rating}/5</small>
                      </span>
                    </div>
                    <span className={styles.tableProduct}>
                      {review.productTitle || review.productHandle || "Storewide review"}
                    </span>
                    <div className={styles.tableCustomer}>
                      <span className={styles.customerAvatar}>
                        {getCustomerInitials(review.customerName)}
                      </span>
                      <div>
                        <strong>{review.customerName || "Customer"}</strong>
                        <span>{formatDate(review.createdAt)}</span>
                      </div>
                    </div>
                    <s-badge tone="success">
                      Published
                    </s-badge>
                    <span className={styles.rowChevron}>⌄</span>
                  </summary>

                  <div className={styles.reviewRowDetails}>
                    <div className={styles.reviewContent}>
                      <span>Customer review</span>
                      <p className={styles.reviewBody}>{review.body}</p>
                    </div>
                    {review.merchantReply ? (
                      <div className={styles.merchantReply}>
                        <span className={styles.replyMark}>↳</span>
                        <div>
                          <span>Response from your store</span>
                          <p>{review.merchantReply}</p>
                        </div>
                      </div>
                    ) : null}
                    {editingReplyId === review.id ? (
                      <div className={styles.replyEditorBox}>
                        <fetcher.Form method="post">
                          <input type="hidden" name="reviewId" value={review.id} />
                          <input type="hidden" name="intent" value="save-reply" />
                          <div className={styles.replyEditorHeader}>
                            <label htmlFor={`reply-${review.id}`}>Public store reply</label>
                            <button
                              type="button"
                              className={styles.closeEditorBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingReplyId(null);
                              }}
                              aria-label="Close"
                            >
                              ✕
                            </button>
                          </div>
                          <textarea
                            defaultValue={review.merchantReply || ""}
                            id={`reply-${review.id}`}
                            maxLength="1000"
                            name="merchantReply"
                            placeholder="Thank the customer or answer their feedback…"
                            rows="3"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className={styles.replyEditorActions}>
                            <button
                              type="submit"
                              className={styles.saveReplyBtn}
                              disabled={fetcher.state === "submitting"}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {fetcher.state === "submitting" ? "Saving..." : "Save reply"}
                            </button>
                            <button
                              type="button"
                              className={styles.cancelReplyBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingReplyId(null);
                              }}
                            >
                              Cancel
                            </button>
                            {review.merchantReply ? (
                              <button
                                type="submit"
                                name="merchantReply"
                                value=""
                                className={styles.deleteReplyBtn}
                                disabled={fetcher.state === "submitting"}
                                onClick={(e) => e.stopPropagation()}
                              >
                                Remove reply
                              </button>
                            ) : null}
                          </div>
                        </fetcher.Form>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.respondToggleBtn}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingReplyId(review.id);
                        }}
                      >
                        <span>↳</span>
                        {review.merchantReply ? "Edit store response" : "Respond to customer"}
                      </button>
                    )}
                    <div className={styles.expandedFooter}>
                      <span>{review.customerEmail || "No customer email"}</span>
                      <span>Reply publicly to customer feedback</span>
                    </div>
                  </div>
                </details>
              ))}
            </div>
            ) : (
              <div className={styles.noFilterResults}>
                <span>⌕</span>
                <div>
                  <h3>No matching reviews</h3>
                  <p>Try another product name or clear some filters.</p>
                </div>
              </div>
            )}
          </div>
        )}
          </s-section>
        </main>

        <aside className={styles.dashboardAside}>
          <s-section heading="Recent activity">
        {latestReview ? (
          <div className={styles.activityPanel}>
            <span>Latest review</span>
            <h3>{latestReview.title || "Untitled review"}</h3>
            <span className={styles.activityProductPill}>
              {latestReview.productTitle || latestReview.productHandle || "Storewide review"}
            </span>
            <p>
              {latestReview.customerName} · {formatDate(latestReview.createdAt)}
            </p>
          </div>
        ) : (
          <div className={styles.activityPanel}>
            <span>Recent activity</span>
            <p>No activity yet.</p>
          </div>
        )}
          </s-section>

          <s-section heading="Pricing">
        <div className={styles.pricingCard}>
          <div className={styles.pricingCardHeader}>
            <div className={styles.pricingBadge}>{plan.name}</div>
            <div className={styles.activePlanStatus}>
              <span aria-hidden="true">
                <svg viewBox="0 0 16 16">
                  <path d="m4.3 8.2 2.2 2.2 5.2-5.3" />
                </svg>
              </span>
              Currently active
            </div>
          </div>
          <h3>
            {plan.price}
            {plan.suffix ? <small>{plan.suffix}</small> : null}
          </h3>
          <p>{planUsageLabel}</p>
          <p className={styles.remainingReviews}>
            {remainingReviews === null
              ? "You have unlimited reviews available."
              : `You have ${remainingReviews} ${
                  remainingReviews === 1 ? "review" : "reviews"
                } remaining this month.`}
          </p>
          {usage?.nextResetDate ? (
            <p style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
              Monthly quota resets on <strong>{usage.nextResetDate}</strong>
            </p>
          ) : null}
          <ul>
            <li>
              {plan.reviewLimit === null
                ? "Unlimited reviews"
                : `${plan.reviewLimit} review limit`}
            </li>
            <li>Storefront review section</li>
            <li>Public review replies</li>
          </ul>
        </div>
          </s-section>
        </aside>
      </div>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
