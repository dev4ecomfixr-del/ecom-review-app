(function () {
  const stars = (rating) => {
    const value = Math.max(0, Math.min(5, Number(rating || 0)));
    return "★★★★★".slice(0, value) + "☆☆☆☆☆".slice(0, 5 - value);
  };
  document.querySelectorAll("[data-review-vibe]").forEach((block) => {
    const body = block.querySelector("[data-review-vibe-body]");
    const author = block.querySelector("[data-review-vibe-author]");
    const rating = block.querySelector("[data-review-vibe-stars]");
    const media = block.querySelector("[data-review-vibe-media]");
    const image = block.querySelector("[data-review-vibe-image]");
    const video = block.querySelector("[data-review-vibe-video]");
    const url = new URL(block.dataset.proxyPath || "/apps/reviews", location.origin);
    url.searchParams.set("shop", block.dataset.shop || "");
    if (block.dataset.productId) url.searchParams.set("productId", block.dataset.productId);
    if (block.dataset.productHandle) url.searchParams.set("productHandle", block.dataset.productHandle);
    let reviews = [], index = 0;
    const paint = () => {
      const review = reviews[index];
      if (!review) return;
      body.textContent = review.body || "";
      author.textContent = review.customerName || "";
      rating.textContent = stars(review.rating);
      const item = (review.photos || []).find((photo) => photo.url);
      media.hidden = !item;
      image.hidden = item?.mediaType === "VIDEO";
      video.hidden = item?.mediaType !== "VIDEO";
      if (item?.mediaType === "VIDEO") video.src = item.url;
      else if (item) { image.src = item.url; image.alt = item.alt || `Review photo by ${review.customerName}`; }
    };
    fetch(url, { cache: "no-store" }).then((response) => response.json()).then((data) => {
      reviews = data.reviews || [];
      block.hidden = false;
      if (!reviews.length) { body.textContent = block.dataset.emptyMessage || "No published reviews yet."; return; }
      paint();
      if (reviews.length > 1) setInterval(() => { index = (index + 1) % reviews.length; paint(); }, Math.max(3, Number(block.dataset.autoplaySpeed || 5)) * 1000);
    }).catch(() => { block.hidden = true; });
  });
})();
