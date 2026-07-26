(function () {
  if (window.EcomReviewer?.appEmbedEnabled) return;

  const embed = document.querySelector("[data-ecom-reviewer-app-embed]");
  if (!embed) return;

  window.EcomReviewer = {
    ...(window.EcomReviewer || {}),
    appEmbedEnabled: true,
    shop: embed.dataset.shop || "",
  };

  document.dispatchEvent(
    new CustomEvent("ecom-reviewer:app-embed-ready", {
      detail: { shop: window.EcomReviewer.shop },
    }),
  );
})();
