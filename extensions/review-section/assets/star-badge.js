(function () {
  const badges = document.querySelectorAll("[data-review-badge]");

  badges.forEach((badge) => {
    const shop = badge.dataset.shop;
    const productId = badge.dataset.productId;
    const productHandle = badge.dataset.productHandle;
    const proxyPath = badge.dataset.proxyPath || "/apps/reviews";
    const emptyLabel = badge.dataset.emptyLabel || "No reviews yet";
    const ratingEl = badge.querySelector("[data-review-badge-rating]");
    const countEl = badge.querySelector("[data-review-badge-count]");

    badge.hidden = true;

    const url = new URL(proxyPath, window.location.origin);
    url.searchParams.set("shop", shop);
    url.searchParams.set("summary", "true");
    url.searchParams.set("_", String(Date.now()));
    if (productId) url.searchParams.set("productId", productId);
    if (productHandle) url.searchParams.set("productHandle", productHandle);

    fetch(url, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!data.features?.starBadge) {
          badge.hidden = true;
          return;
        }

        badge.hidden = false;

        const summary = data.summary || {};
        const count = summary.reviewCount || 0;
        const average = Number(summary.averageRating || 0);

        if (!count) {
          ratingEl.textContent = emptyLabel;
          ratingEl.dataset.shineText = emptyLabel;
          countEl.textContent = "";
          countEl.dataset.shineText = "";
          return;
        }

        ratingEl.textContent = `${average.toFixed(1)}/5 ratings`;
        countEl.textContent = `based on ${count.toLocaleString()} customers`;
        ratingEl.dataset.shineText = ratingEl.textContent;
        countEl.dataset.shineText = countEl.textContent;
      })
      .catch(() => {
        badge.hidden = true;
        ratingEl.textContent = emptyLabel;
        ratingEl.dataset.shineText = emptyLabel;
        countEl.textContent = "";
        countEl.dataset.shineText = "";
      });
  });
})();
