(function () {
  const widgets = document.querySelectorAll("[data-review-widget]");

  widgets.forEach((widget) => {
    const shop = widget.dataset.shop;
    const productId = widget.dataset.productId;
    const productHandle = widget.dataset.productHandle;
    const productTitle = widget.dataset.productTitle;
    const proxyPath = widget.dataset.proxyPath || "/apps/reviews";
    const carouselAutoplay = widget.dataset.reviewCarouselAutoplay !== "false";
    const carouselSpeed = Math.max(
      3,
      Math.min(12, Number(widget.dataset.reviewCarouselSpeed) || 5),
    );
    const infiniteSpeed = Math.max(
      3,
      Math.min(12, Number(widget.dataset.reviewInfiniteSpeed) || 5),
    );
    widget.style.setProperty(
      "--review-infinite-duration",
      `${infiniteSpeed * 3}s`,
    );
    const form = widget.querySelector("[data-review-form]");
    const list = widget.querySelector("[data-review-list]");
    const message = widget.querySelector("[data-review-message]");
    const photoInput = widget.querySelector("[data-review-photo-input]");
    const photoPreview = widget.querySelector("[data-review-photo-preview]");
    const photoHelp = widget.querySelector("[data-review-photo-help]");
    const progress = widget.querySelector("[data-review-progress]");
    const progressTrack = widget.querySelector("[data-review-progress-track]");
    const progressBar = widget.querySelector("[data-review-progress-bar]");
    const progressLabel = widget.querySelector("[data-review-progress-label]");
    const submitButton = form.querySelector('button[type="submit"]');
    const formPanel = widget.querySelector("[data-review-form-panel]");
    const formToggle = widget.querySelector("[data-review-form-toggle]");
    const searchInput = widget.querySelector("[data-review-search]");
    const sortSelect = widget.querySelector("[data-review-sort]");
    const ratingFilter = widget.querySelector("[data-review-rating-filter]");
    const reviewToolbar = widget.querySelector(".ecom-reviewer__toolbar");
    const averageOutput = widget.querySelector("[data-review-average]");
    const countOutput = widget.querySelector("[data-review-count]");
    const resultsCountOutput = widget.querySelector("[data-review-results-count]");
    const carouselPrevious = widget.querySelector("[data-review-carousel-prev]");
    const carouselNext = widget.querySelector("[data-review-carousel-next]");
    const pagination = widget.querySelector("[data-review-pagination]");
    const pagePrevious = widget.querySelector("[data-review-page-prev]");
    const pageNext = widget.querySelector("[data-review-page-next]");
    const paginationPages = widget.querySelector("[data-review-pagination-pages]");
    const usesPagination = [1, 2, 3, 4, 5].some((layout) =>
      widget.classList.contains(`ecom-reviewer--layout-${layout}`),
    );
    const reviewsPerPage = 4;
    const formToggleLabel = formToggle?.textContent.trim() || "Write a review";
    let reward = widget.querySelector("[data-review-reward]");
    let selectedMediaFiles = [];
    let loadedReviews = [];
    let currentReviewPage = 0;

    formToggle?.addEventListener("click", () => {
      const willOpen = formPanel.hidden;
      formPanel.hidden = !willOpen;
      formToggle.textContent = willOpen ? "Close review form" : formToggleLabel;
      if (willOpen) formPanel.querySelector("input, textarea")?.focus();
    });

    const copyCoupon = async (code) => {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        return;
      }
      const input = document.createElement("textarea");
      input.value = code;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    };

    const bindRewardEvents = () => {
      if (!reward || reward.dataset.eventsBound === "true") return;
      reward.dataset.eventsBound = "true";
      reward.addEventListener("click", async (event) => {
        if (event.target.closest("[data-review-reward-close]")) closeReward();
        const copyButton = event.target.closest("[data-review-reward-copy]");
        if (copyButton) {
          const code = reward.dataset.discountCode || "";
          if (!code) return;
          try {
            await copyCoupon(code);
            copyButton.textContent = "Copied!";
            copyButton.setAttribute("aria-label", `${code} copied`);
            window.setTimeout(() => {
              copyButton.textContent = code;
              copyButton.setAttribute("aria-label", `Copy coupon code ${code}`);
            }, 1400);
          } catch {
            copyButton.textContent = "Copy failed";
            window.setTimeout(() => { copyButton.textContent = code; }, 1400);
          }
        }
      });
    };

    const createReward = (settings) => {
      reward?.remove();
      reward = document.createElement("div");
      reward.className = "ecom-reviewer-reward";
      reward.dataset.reviewReward = "";
      reward.dataset.discountCode = settings.discountCode || "";
      reward.dataset.redirectPath = settings.redirectPath || "/collections/all";
      reward.hidden = true;
      reward.style.setProperty("--ecom-reward-accent", settings.accentColor || "#18B487");
      const image = settings.imageUrl
        ? `<img alt="" class="ecom-reviewer-reward__image" src="${escapeHtml(settings.imageUrl)}">`
        : '<div class="ecom-reviewer-reward__image-fallback">THANK YOU</div>';
      const buttonText = settings.discountCode || "Continue shopping";
      const rewardHeading = String(
        settings.heading || "Thank you for your review",
      ).replaceAll(
        "[[percentage]]",
        `${Number(settings.discountValue) || 20}%`,
      );
      reward.innerHTML = `
        <div class="ecom-reviewer-reward__backdrop" data-review-reward-close></div>
        <div aria-modal="true" class="ecom-reviewer-reward__dialog" role="dialog">
          <button aria-label="Close reward popup" class="ecom-reviewer-reward__close" data-review-reward-close type="button">×</button>
          ${image}
          <div class="ecom-reviewer-reward__content">
            <h2>${escapeHtml(rewardHeading)}</h2>
            <p>${escapeHtml(settings.message || "")}</p>
            ${settings.discountCode ? "<span>Your coupon code · Click to copy</span>" : ""}
            <button aria-label="Copy coupon code ${escapeHtml(buttonText)}" class="ecom-reviewer-reward__apply" data-review-reward-copy type="button">${escapeHtml(buttonText)}</button>
          </div>
        </div>`;
      widget.appendChild(reward);
      bindRewardEvents();
    };

    const closeReward = () => {
      if (!reward) return;
      reward.hidden = true;
      document.documentElement.classList.remove("ecom-reviewer-reward-open");
    };

    const openReward = (settings) => {
      if (settings && !settings.enabled) return;
      if (settings?.enabled) createReward(settings);
      if (!reward) return;
      const code = reward.dataset.discountCode || "";
      if (!code) return;
      reward.hidden = false;
      document.documentElement.classList.add("ecom-reviewer-reward-open");
      reward.querySelector(".ecom-reviewer-reward__close")?.focus();
    };

    bindRewardEvents();
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && reward && !reward.hidden) closeReward();
    });

    const makeUrl = () => {
      const url = new URL(proxyPath, window.location.origin);
      url.searchParams.set("shop", shop);
      if (productId) url.searchParams.set("productId", productId);
      if (productHandle) url.searchParams.set("productHandle", productHandle);
      return url;
    };

    const stars = (rating) =>
      `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;

    const setProgress = (percent, label) => {
      if (!progress) return;
      const value = Math.max(0, Math.min(100, Math.round(percent)));
      progress.hidden = false;
      progressBar.style.width = `${value}%`;
      progressTrack.setAttribute("aria-valuenow", String(value));
      progressLabel.textContent = label;
    };

    const uploadReview = (formData) => new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", makeUrl());
      request.responseType = "json";
      request.upload.addEventListener("loadstart", () => setProgress(4, "Starting upload…"));
      request.upload.addEventListener("progress", (event) => {
        if (!event.lengthComputable) return;
        const ratio = event.loaded / event.total;
        setProgress(5 + ratio * 80, `Uploading media… ${Math.round(ratio * 100)}%`);
      });
      request.upload.addEventListener("load", () => setProgress(88, "Upload complete. Processing media…"));
      request.addEventListener("load", () => {
        const contentType = request.getResponseHeader("content-type") || "";
        resolve({
          data: contentType.includes("application/json") ? request.response || {} : {},
          ok:
            request.status >= 200 &&
            request.status < 300 &&
            contentType.includes("application/json"),
        });
      });
      request.addEventListener("error", () => reject(new Error("Network error while uploading review.")));
      request.addEventListener("abort", () => reject(new Error("Review upload was cancelled.")));
      request.send(formData);
    });

    const updateSummary = (reviews) => {
      const count = reviews.length;
      const average = count
        ? reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / count
        : 0;
      if (averageOutput) averageOutput.textContent = average.toFixed(2);
      if (countOutput) countOutput.textContent = String(count);
      for (let rating = 1; rating <= 5; rating += 1) {
        const bar = widget.querySelector(`[data-review-rating-bar="${rating}"]`);
        const ratingCount = reviews.filter((review) => Number(review.rating) === rating).length;
        if (bar) bar.style.width = `${count ? (ratingCount / count) * 100 : 0}%`;
      }
    };

    const renderReviews = (reviews) => {
      if (!reviews.length) {
        list.innerHTML = '<p class="ecom-reviewer__empty">No reviews yet.</p>';
        return;
      }

      if (widget.classList.contains("ecom-reviewer--layout-7")) {
        widget.style.setProperty(
          "--review-infinite-duration",
          `${Math.max(12, reviews.length * infiniteSpeed)}s`,
        );
      }

      const reviewCards = reviews
        .map(
          (review) => `
            <article class="ecom-reviewer__item">
              <div class="ecom-reviewer__review-card-head">
                <div class="ecom-reviewer__author">
                  <b>${escapeHtml(getInitials(review.customerName))}</b>
                  <div>
                    <strong>${escapeHtml(review.customerName || "Customer")}</strong>
                    <small><span>✓</span> Verified buyer</small>
                  </div>
                </div>
                <div class="ecom-reviewer__stars" aria-label="${review.rating} out of 5 stars">${stars(review.rating)}</div>
              </div>
              <div class="ecom-reviewer__review-content">
                ${review.title ? `<h3>${escapeHtml(review.title)}</h3>` : ""}
                <p>${escapeHtml(review.body)}</p>
                ${renderMedia(review.photos || [])}
                ${review.merchantReply ? `<div class="ecom-reviewer__merchant-reply"><strong>Store reply</strong><p>${escapeHtml(review.merchantReply)}</p></div>` : ""}
              </div>
              <div class="ecom-reviewer__review-card-footer">
                <time>${review.createdAt ? formatDate(review.createdAt) : ""}</time>
                <span class="ecom-reviewer__recommend">♥ <small>Would recommend</small></span>
              </div>
            </article>
          `,
        )
        .join("");
      list.innerHTML = widget.classList.contains("ecom-reviewer--layout-7")
        ? `${reviewCards}${reviewCards.replaceAll("<article", '<article aria-hidden="true"')}`
        : reviewCards;
    };

    const applyReviewControls = () => {
      const query = (searchInput?.value || "").trim().toLowerCase();
      const selectedRating = ratingFilter?.value || "all";
      const sort = sortSelect?.value || "newest";
      const reviews = loadedReviews
        .filter((review) => selectedRating === "all" || Number(review.rating) === Number(selectedRating))
        .filter((review) => !query || [review.title, review.body, review.customerName]
          .some((value) => String(value || "").toLowerCase().includes(query)))
        .sort((a, b) => {
          if (sort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
          if (sort === "highest") return Number(b.rating) - Number(a.rating);
          if (sort === "lowest") return Number(a.rating) - Number(b.rating);
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
      if (resultsCountOutput) resultsCountOutput.textContent = String(reviews.length);

      if (!usesPagination) {
        if (pagination) pagination.hidden = true;
        renderReviews(reviews);
        return;
      }

      const totalPages = Math.max(1, Math.ceil(reviews.length / reviewsPerPage));
      currentReviewPage = Math.max(0, Math.min(currentReviewPage, totalPages - 1));
      const pageStart = currentReviewPage * reviewsPerPage;

      renderReviews(reviews.slice(pageStart, pageStart + reviewsPerPage));
      if (pagination) pagination.hidden = reviews.length <= reviewsPerPage;
      if (paginationPages) {
        paginationPages.innerHTML = Array.from({ length: totalPages }, (_, index) => `
          <button
            aria-label="Go to review page ${index + 1}"
            aria-current="${index === currentReviewPage ? "page" : "false"}"
            class="${index === currentReviewPage ? "is-active" : ""}"
            data-review-page="${index}"
            type="button"
          >${index + 1}</button>
        `).join("");
      }
      if (pagePrevious) pagePrevious.disabled = currentReviewPage === 0;
      if (pageNext) pageNext.disabled = currentReviewPage >= totalPages - 1;
    };

    [searchInput, sortSelect, ratingFilter].forEach((control) => {
      control?.addEventListener(control === searchInput ? "input" : "change", () => {
        currentReviewPage = 0;
        applyReviewControls();
      });
    });

    const showReviewPageTop = () => {
      window.requestAnimationFrame(() => {
        (reviewToolbar || list).scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    };

    const changeReviewPage = (direction) => {
      currentReviewPage += direction;
      applyReviewControls();
      showReviewPageTop();
    };
    pagePrevious?.addEventListener("click", () => changeReviewPage(-1));
    pageNext?.addEventListener("click", () => changeReviewPage(1));
    paginationPages?.addEventListener("click", (event) => {
      const pageButton = event.target.closest("[data-review-page]");
      if (!pageButton) return;
      currentReviewPage = Number(pageButton.dataset.reviewPage);
      applyReviewControls();
      showReviewPageTop();
    });

    const scrollReviews = (direction) => {
      list.scrollBy({
        behavior: "smooth",
        left: direction * Math.max(280, list.clientWidth * 0.82),
      });
    };
    carouselPrevious?.addEventListener("click", () => scrollReviews(-1));
    carouselNext?.addEventListener("click", () => scrollReviews(1));

    let carouselAutoplayId;
    const stopCarouselAutoplay = () => {
      if (carouselAutoplayId) window.clearInterval(carouselAutoplayId);
      carouselAutoplayId = undefined;
    };
    const startCarouselAutoplay = () => {
      stopCarouselAutoplay();
      if (
        !carouselAutoplay ||
        !widget.classList.contains("ecom-reviewer--layout-5") ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) return;
      carouselAutoplayId = window.setInterval(() => {
        if (list.scrollWidth <= list.clientWidth) return;
        const atEnd = list.scrollLeft + list.clientWidth >= list.scrollWidth - 8;
        if (atEnd) {
          list.scrollTo({ behavior: "smooth", left: 0 });
        } else {
          scrollReviews(1);
        }
      }, carouselSpeed * 1000);
    };
    list.addEventListener("pointerenter", stopCarouselAutoplay);
    list.addEventListener("pointerleave", startCarouselAutoplay);
    list.addEventListener("focusin", stopCarouselAutoplay);
    list.addEventListener("focusout", startCarouselAutoplay);
    startCarouselAutoplay();

    const loadReviews = async () => {
      const response = await fetch(makeUrl());
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("application/json")) {
        throw new Error("The review service returned an invalid response.");
      }
      const data = await response.json();
      loadedReviews = data.reviews || [];
      currentReviewPage = 0;
      updateSummary(loadedReviews);
      applyReviewControls();
    };

    const renderSelectedPhotos = () => {
      if (!photoInput || !photoPreview) return;

      if (photoHelp) {
        photoHelp.textContent = selectedMediaFiles.length
          ? `${selectedMediaFiles.length} of 5 files selected · choose Upload media to add more`
          : "Max 5 files. JPG, PNG, WebP, MP4, MOV, or WebM only.";
      }

      photoPreview
        .querySelectorAll("img, video")
        .forEach((media) => URL.revokeObjectURL(media.src));

      photoPreview.innerHTML = selectedMediaFiles
        .map((file, index) => {
          const mediaUrl = URL.createObjectURL(file);
          const removeButton = `<button type="button" class="ecom-reviewer__photo-remove" data-review-media-remove="${index}" aria-label="Remove ${escapeHtml(file.name)}">×</button>`;

          if (file.type.startsWith("video/")) {
            return `<div class="ecom-reviewer__photo-preview-item"><video src="${mediaUrl}" muted playsinline></video>${removeButton}<span>Video</span></div>`;
          }

          return `<div class="ecom-reviewer__photo-preview-item"><img src="${mediaUrl}" alt="${escapeHtml(file.name)}">${removeButton}</div>`;
        })
        .join("");
    };

    if (photoInput) {
      photoInput.addEventListener("change", () => {
        const validTypes = new Set([
          "image/jpeg", "image/png", "image/webp", "video/mp4",
          "video/quicktime", "video/webm",
        ]);
        const incomingFiles = Array.from(photoInput.files || []).filter((file) =>
          validTypes.has(file.type),
        );
        const existingFiles = new Set(
          selectedMediaFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`),
        );

        incomingFiles.forEach((file) => {
          const key = `${file.name}:${file.size}:${file.lastModified}`;
          if (selectedMediaFiles.length < 5 && !existingFiles.has(key)) {
            selectedMediaFiles.push(file);
            existingFiles.add(key);
          }
        });

        if (selectedMediaFiles.length === 5 && incomingFiles.length) {
          message.textContent = "Maximum 5 media files selected.";
        }

        photoInput.value = "";
        renderSelectedPhotos();
      });

      photoPreview.addEventListener("click", (event) => {
        const removeButton = event.target.closest("[data-review-media-remove]");
        if (!removeButton) return;
        selectedMediaFiles.splice(Number(removeButton.dataset.reviewMediaRemove), 1);
        message.textContent = "";
        renderSelectedPhotos();
      });
    }

    list.addEventListener("click", (event) => {
      const photoButton = event.target.closest("[data-review-photo-open]");

      if (!photoButton) return;

      openPhotoViewer({
        alt: photoButton.dataset.photoAlt || "Review photo",
        url: photoButton.dataset.photoUrl,
      });
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const formData = new FormData(form);
      formData.delete("photos");
      selectedMediaFiles.forEach((file) => formData.append("photos", file));
      const selectedPhotoCount = selectedMediaFiles.length;

      message.textContent = selectedPhotoCount
        ? "Uploading media..."
        : "Submitting...";

      formData.set("shop", shop);
      formData.set("productId", productId);
      formData.set("productHandle", productHandle);
      formData.set("productTitle", productTitle);

      submitButton.disabled = true;
      submitButton.setAttribute("aria-busy", "true");
      setProgress(2, selectedPhotoCount ? "Preparing media…" : "Submitting review…");

      try {
        const { data, ok } = await uploadReview(formData);

        if (!ok) {
          progress.hidden = true;
          message.textContent = data.error || "Could not submit your review. Please try again.";
          return;
        }

        setProgress(100, "Review submitted successfully");
        form.reset();
        selectedMediaFiles = [];
        renderSelectedPhotos();
        message.textContent = data.reviewRewardError || "Done";
        if (data.reviewReward?.discountCode) openReward(data.reviewReward);
        loadReviews().catch(() => {});
        window.setTimeout(() => { progress.hidden = true; }, 900);
      } catch (error) {
        progress.hidden = true;
        message.textContent = error.message || "Could not submit your review. Please try again.";
      } finally {
        submitButton.disabled = false;
        submitButton.removeAttribute("aria-busy");
      }
    });

    loadReviews().catch(() => {
      list.innerHTML =
        '<p class="ecom-reviewer__empty">Reviews are unavailable right now.</p>';
    });
  });

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value || "";
    return div.innerHTML;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  }

  function getInitials(value) {
    return String(value || "Customer")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "C";
  }

  function renderMedia(media) {
    const validMedia = media.filter((item) => item.url);

    if (!validMedia.length) return "";

    return `
      <div class="ecom-reviewer__review-photos">
        ${validMedia
          .map((item) => {
            const alt = escapeHtml(item.alt || "Review media");
            const url = escapeHtml(item.url);

            if (item.mediaType === "VIDEO") {
              return `<video src="${url}" controls playsinline preload="metadata" aria-label="${alt}"></video>`;
            }

            return `<button type="button" data-review-photo-open data-photo-url="${url}" data-photo-alt="${alt}" aria-label="Open review photo"><img src="${url}" alt="${alt}" loading="lazy"></button>`;
          })
          .join("")}
      </div>
    `;
  }

  function openPhotoViewer({ alt, url }) {
    if (!url) return;

    let viewer = document.querySelector("[data-review-photo-viewer]");

    if (!viewer) {
      viewer = document.createElement("div");
      viewer.className = "ecom-reviewer__photo-viewer";
      viewer.dataset.reviewPhotoViewer = "true";
      viewer.innerHTML = `
        <button class="ecom-reviewer__photo-viewer-close" type="button" data-review-photo-close aria-label="Close review photo">×</button>
        <img alt="">
      `;
      document.body.appendChild(viewer);

      viewer.addEventListener("click", (event) => {
        if (
          event.target === viewer ||
          event.target.closest("[data-review-photo-close]")
        ) {
          closePhotoViewer(viewer);
        }
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closePhotoViewer(viewer);
        }
      });
    }

    const image = viewer.querySelector("img");
    image.src = url;
    image.alt = alt;
    viewer.hidden = false;
    document.documentElement.classList.add("ecom-reviewer-photo-open");
  }

  function closePhotoViewer(viewer) {
    if (!viewer || viewer.hidden) return;

    viewer.hidden = true;
    document.documentElement.classList.remove("ecom-reviewer-photo-open");
  }
})();
