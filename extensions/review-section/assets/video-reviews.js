(function () {
  const clampRating = (rating) => Math.max(0, Math.min(5, Number(rating || 0)));
  const stars = (rating) => {
    const rounded = Math.round(clampRating(rating));
    return "★".repeat(rounded) + "☆".repeat(5 - rounded);
  };

  document.querySelectorAll("[data-video-reviews]").forEach((block) => {
    const track = block.querySelector("[data-video-reviews-track]");
    const viewport = block.querySelector("[data-video-reviews-viewport]");
    const summaryEl = block.querySelector("[data-video-reviews-summary]");
    const nav = block.querySelector("[data-video-reviews-nav]");
    const previous = block.querySelector("[data-video-reviews-prev]");
    const next = block.querySelector("[data-video-reviews-next]");
    const desktopCards = Math.max(3, Math.min(6, Number(block.dataset.desktopCards || 5)));
    const mobileCards = Math.max(1, Math.min(2, Number(block.dataset.mobileCards || 1)));
    const autoplay = block.dataset.autoplay === "true";
    const infiniteLayout = block.dataset.layout === "layout-3";
    const scrollSpeed = Math.max(10, Math.min(100, Number(block.dataset.scrollSpeed || 40)));
    const autoplaySpeed = Math.max(3, Number(block.dataset.autoplaySpeed || 5)) * 1000;
    let currentPage = 0;
    let autoplayId = null;
    let infiniteResetPoint = 0;
    const buildUrl = (summary) => {
      const url = new URL(block.dataset.proxyPath || "/apps/reviews", window.location.origin);
      url.searchParams.set("shop", block.dataset.shop || "");
      if (summary) url.searchParams.set("summary", "true");
      if (block.dataset.productId) url.searchParams.set("productId", block.dataset.productId);
      if (block.dataset.productHandle) url.searchParams.set("productHandle", block.dataset.productHandle);
      return url;
    };

    const createMedia = (review, media) => {
      if (!media?.url) {
        const fallback = document.createElement("div");
        fallback.className = "ecom-reviewer-story__fallback";
        fallback.textContent = (review.customerName || "C").charAt(0).toUpperCase();
        return fallback;
      }

      if (media.mediaType === "VIDEO") {
        const wrap = document.createElement("div");
        wrap.className = "ecom-reviewer-story__video";
        const video = document.createElement("video");
        video.src = media.url;
        video.preload = "metadata";
        video.playsInline = true;
        video.muted = autoplay || infiniteLayout;
        video.loop = autoplay || infiniteLayout;
        video.setAttribute("aria-label", media.alt || `Review video by ${review.customerName}`);
        const play = document.createElement("button");
        play.type = "button";
        play.className = "ecom-reviewer-story__play";
        play.setAttribute("aria-label", `Play review from ${review.customerName}`);
        play.textContent = "▶";
        play.addEventListener("click", () => {
          if (video.paused) { video.play(); play.textContent = "Ⅱ"; }
          else { video.pause(); play.textContent = "▶"; }
        });
        video.addEventListener("ended", () => { play.textContent = "▶"; });
        if (autoplay || infiniteLayout) {
          play.hidden = true;
        }
        wrap.append(video, play);
        return wrap;
      }

      const image = document.createElement("img");
      image.src = media.url;
      image.alt = media.alt || `Review photo by ${review.customerName}`;
      image.loading = "lazy";
      return image;
    };

    const createCard = (review, index) => {
      const card = document.createElement("article");
      card.className = "ecom-reviewer-story";
      card.style.setProperty("--ers-index", String(index % 5));
      card.appendChild(createMedia(review, (review.photos || []).find((item) => item.url)));

      const meta = document.createElement("div");
      meta.className = "ecom-reviewer-story__meta";
      const rating = document.createElement("span");
      rating.textContent = stars(review.rating);
      rating.setAttribute("aria-label", `${review.rating} out of 5 stars`);
      const name = document.createElement("strong");
      name.textContent = review.customerName || "Customer";
      meta.append(rating, name);
      card.appendChild(meta);
      if (infiniteLayout) {
        const video = card.querySelector("video");
        if (video) {
          card.addEventListener("mouseenter", () => {
            track.classList.add("is-paused");
            video.play().catch(() => {});
          });
          card.addEventListener("mouseleave", () => {
            video.pause();
            video.currentTime = 0;
            track.classList.remove("is-paused");
          });
          card.addEventListener("focusin", () => {
            track.classList.add("is-paused");
            video.play().catch(() => {});
          });
          card.addEventListener("focusout", () => {
            video.pause();
            video.currentTime = 0;
            track.classList.remove("is-paused");
          });
        }
      }
      return card;
    };

    const scroll = (direction) => {
      const cards = Array.from(track.querySelectorAll(".ecom-reviewer-story"));
      if (!cards.length) return;

      const visibleCards = window.matchMedia("(min-width: 990px)").matches
        ? desktopCards
        : window.matchMedia("(min-width: 641px)").matches
          ? 3
          : mobileCards;
      const pageCount = Math.ceil(cards.length / visibleCards);
      currentPage = (currentPage + direction + pageCount) % pageCount;
      const targetCard = cards[Math.min(currentPage * visibleCards, cards.length - 1)];

      viewport.scrollTo({ left: targetCard.offsetLeft, behavior: "smooth" });
    };
    const stopAutoplay = () => {
      window.clearInterval(autoplayId);
      autoplayId = null;
    };
    const startAutoplay = () => {
      stopAutoplay();
      if (!autoplay || infiniteLayout || track.children.length <= mobileCards) return;
      autoplayId = window.setInterval(() => scroll(1), autoplaySpeed);
    };
    previous.addEventListener("click", () => scroll(-1));
    next.addEventListener("click", () => scroll(1));
    if (!infiniteLayout) {
      block.addEventListener("mouseenter", stopAutoplay);
      block.addEventListener("mouseleave", startAutoplay);
      block.addEventListener("focusin", stopAutoplay);
      block.addEventListener("focusout", (event) => {
        if (!block.contains(event.relatedTarget)) startAutoplay();
      });
    }
    if (!autoplay) {
      block.addEventListener("play", stopAutoplay, true);
      block.addEventListener("pause", startAutoplay, true);
    }

    Promise.all([
      fetch(buildUrl(true), { cache: "no-store" }).then((response) => response.json()),
      fetch(buildUrl(false), { cache: "no-store" }).then((response) => response.json()),
    ]).then(([summaryData, reviewData]) => {
      if (!summaryData.features?.videoReviews) return;
      const reviews = (reviewData.reviews || []).filter((review) =>
        (review.photos || []).some((item) => item.url && item.mediaType === "VIDEO"),
      );
      const averageRating = reviews.length
        ? reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length
        : 0;
      block.hidden = false;
      summaryEl.replaceChildren();
      const summaryStars = document.createElement("span");
      summaryStars.textContent = stars(averageRating);
      summaryStars.setAttribute("aria-hidden", "true");
      summaryEl.append(summaryStars, ` ${averageRating.toFixed(2)} ★ (${reviews.length})`);

      if (!reviews.length) {
        const empty = document.createElement("p");
        empty.className = "ecom-reviewer-stories__empty";
        empty.textContent = block.dataset.emptyMessage || "No published reviews yet.";
        track.appendChild(empty);
        return;
      }

      reviews.forEach((review, index) => track.appendChild(createCard(review, index)));
      if (infiniteLayout && reviews.length > 1) {
        reviews.forEach((review, index) => track.appendChild(createCard(review, index + reviews.length)));
        const configureInfiniteTrack = () => {
          const firstClone = track.children[reviews.length];
          infiniteResetPoint = firstClone?.offsetLeft || 0;
          if (!infiniteResetPoint) return;
          track.style.setProperty("--ers-marquee-distance", `${infiniteResetPoint}px`);
          track.style.setProperty("--ers-marquee-translate", `-${infiniteResetPoint}px`);
          track.style.setProperty(
            "--ers-marquee-duration",
            `${Math.max(8, infiniteResetPoint / scrollSpeed)}s`,
          );
          track.classList.add("is-running");
        };
        window.requestAnimationFrame(() => {
          configureInfiniteTrack();
          window.requestAnimationFrame(configureInfiniteTrack);
        });
        window.addEventListener("resize", configureInfiniteTrack, { passive: true });
      }
      nav.hidden = infiniteLayout || reviews.length < 2;
      if (autoplay && !infiniteLayout) {
        const videoObserver = new IntersectionObserver(
          (entries) => entries.forEach((entry) => {
            const video = entry.target;
            if (entry.isIntersecting) {
              video.play().catch(() => {});
            } else {
              video.pause();
            }
          }),
          { root: viewport, threshold: 0.65 },
        );
        track.querySelectorAll("video").forEach((video) => videoObserver.observe(video));
      }
      if (!infiniteLayout) startAutoplay();
    }).catch(() => { block.hidden = true; });
  });
})();
