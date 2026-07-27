import { useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { DEFAULT_PLAN, getPlanByCode, getPlanUsageLabel } from "../lib/plans";
import { getShopPlanCode } from "../lib/shop-plans.server";
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
        hiddenReviews: 0,
        pendingReviews: 0,
        averageRating: 0,
      },
      plan: DEFAULT_PLAN,
      planUsageLabel: getPlanUsageLabel(DEFAULT_PLAN, 0),
    };
  }

  const [
    reviews,
    totalReviews,
    publishedReviews,
    hiddenReviews,
    pendingReviews,
    averageRating,
    planCode,
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
        where: { shop: session.shop, status: "HIDDEN" },
      }),
      reviewDelegate.count({
        where: { shop: session.shop, status: "PENDING" },
      }),
      reviewDelegate.aggregate({
        where: { shop: session.shop, status: "PUBLISHED" },
        _avg: { rating: true },
      }),
      getShopPlanCode(session.shop),
    ]);
  const plan = getPlanByCode(planCode || DEFAULT_PLAN.code);

  return {
    shop: session.shop,
    reviews,
    stats: {
      totalReviews,
      publishedReviews,
      hiddenReviews,
      pendingReviews,
      averageRating: averageRating._avg.rating || 0,
    },
    plan,
    planUsageLabel: getPlanUsageLabel(plan, totalReviews),
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const reviewDelegate = db.review;
  const formData = await request.formData();
  const intent = formData.get("intent");
  const reviewId = formData.get("reviewId");

  if (intent === "delete-all" && reviewDelegate) {
    await reviewDelegate.deleteMany({
      where: { shop: session.shop },
    });

    return { ok: true };
  }

  if (intent === "save-reply" && reviewId && reviewDelegate) {
    const merchantReply = String(formData.get("merchantReply") || "").trim().slice(0, 1000);
    await reviewDelegate.updateMany({
      where: { id: String(reviewId), shop: session.shop },
      data: {
        merchantReply: merchantReply || null,
        repliedAt: merchantReply ? new Date() : null,
      },
    });
    return { ok: true };
  }

  if (!reviewId || !reviewDelegate) {
    return { ok: false };
  }

  if (intent === "delete") {
    await reviewDelegate.deleteMany({
      where: { id: String(reviewId), shop: session.shop },
    });
  }

  if (intent === "toggle-status") {
    const review = await reviewDelegate.findFirst({
      where: { id: String(reviewId), shop: session.shop },
      select: { status: true },
    });

    if (review) {
      await reviewDelegate.update({
        where: { id: String(reviewId) },
        data: {
          status: review.status === "PUBLISHED" ? "HIDDEN" : "PUBLISHED",
        },
      });
    }
  }

  if (intent === "approve") {
    await reviewDelegate.updateMany({
      where: { id: String(reviewId), shop: session.shop },
      data: { status: "PUBLISHED" },
    });
  }

  return { ok: true };
};

export default function Dashboard() {
  const { reviews, stats, needsPrismaRestart, plan, planUsageLabel } =
    useLoaderData();
  const fetcher = useFetcher();
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [productSearch, setProductSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const averageRating = stats.averageRating.toFixed(1);
  const latestReview = reviews[0];
  const publishedRate =
    stats.totalReviews > 0
      ? Math.round((stats.publishedReviews / stats.totalReviews) * 100)
      : 0;
  const chartValues = [
    {
      color: "#10b981",
      label: "Published",
      value: stats.publishedReviews,
    },
    {
      color: "#1f2937",
      label: "Hidden",
      value: stats.hiddenReviews,
    },
    {
      color: "#1d4ed8",
      label: "Pending",
      value: stats.pendingReviews,
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
      detail: `${publishedRate}% visible`,
      tone: "emerald",
    },
    {
      label: "Hidden",
      value: stats.hiddenReviews,
      detail: "Moderated reviews",
      tone: "ink",
    },
    {
      label: "Pending",
      value: stats.pendingReviews,
      detail: "Awaiting approval",
      tone: "sky",
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
      statusFilter === "all" ? true : review.status === statusFilter,
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
    statusFilter !== "all" ||
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
              <p className={styles.eyebrow}>Client trust suite</p>
              <h2>Customer review experience</h2>
              <p>
                Showcase authentic customer feedback, build confidence before
                checkout, and keep every review experience polished.
              </p>
              <div className={styles.heroMeta}>
                <span>Storefront-ready reviews</span>
                <span>Customer confidence tools</span>
              </div>
            </div>
            <div className={styles.heroScore}>
              <small>average rating</small>
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
                <span className={styles.pieEyebrow}>Review mix</span>
                <h3>Status breakdown</h3>
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
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="delete-all" />
                <s-button type="submit" tone="critical" variant="secondary">
                  Delete all reviews
                </s-button>
              </fetcher.Form>
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
                  <span>Status</span>
                  <select
                    onChange={(event) => setStatusFilter(event.target.value)}
                    value={statusFilter}
                  >
                    <option value="all">All statuses</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="PENDING">Pending</option>
                    <option value="HIDDEN">Hidden</option>
                  </select>
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
                      setStatusFilter("all");
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
                    <s-badge tone={review.status === "PUBLISHED" ? "success" : "info"}>
                      {review.status}
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
                    <details className={styles.replyEditor}>
                      <summary>
                        <span>↳</span>
                        {review.merchantReply ? "Edit store response" : "Respond to customer"}
                      </summary>
                      <fetcher.Form method="post">
                        <input type="hidden" name="reviewId" value={review.id} />
                        <input type="hidden" name="intent" value="save-reply" />
                        <label htmlFor={`reply-${review.id}`}>Public store reply</label>
                        <textarea
                          defaultValue={review.merchantReply || ""}
                          id={`reply-${review.id}`}
                          maxLength="1000"
                          name="merchantReply"
                          placeholder="Thank the customer or answer their feedback…"
                          rows="3"
                        />
                        <div>
                          <s-button type="submit" variant="primary">Save reply</s-button>
                          {review.merchantReply ? (
                            <span>Clear the text and save to remove the reply.</span>
                          ) : null}
                        </div>
                      </fetcher.Form>
                    </details>
                    <div className={styles.expandedFooter}>
                      <span>{review.customerEmail || "No customer email"}</span>
                      <div className={styles.reviewActions}>
                        {review.status === "PENDING" && (
                          <fetcher.Form method="post">
                            <input type="hidden" name="reviewId" value={review.id} />
                            <input type="hidden" name="intent" value="approve" />
                            <s-button type="submit" variant="primary">Approve</s-button>
                          </fetcher.Form>
                        )}
                        <fetcher.Form method="post">
                          <input type="hidden" name="reviewId" value={review.id} />
                          <input type="hidden" name="intent" value="toggle-status" />
                          <s-button type="submit" variant="secondary">
                            {review.status === "PUBLISHED" ? "Hide" : "Publish"}
                          </s-button>
                        </fetcher.Form>
                        <fetcher.Form method="post">
                          <input type="hidden" name="reviewId" value={review.id} />
                          <input type="hidden" name="intent" value="delete" />
                          <s-button type="submit" tone="critical" variant="secondary">Delete</s-button>
                        </fetcher.Form>
                      </div>
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
          <ul>
            <li>
              {plan.reviewLimit === null
                ? "Unlimited reviews"
                : `${plan.reviewLimit} review limit`}
            </li>
            <li>Storefront review section</li>
            <li>Publish and hide controls</li>
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
