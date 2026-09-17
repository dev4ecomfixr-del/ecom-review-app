(function () {
  const initRewardWidget = () => {
    const root = document.querySelector(".rl-reward-points-root");
    if (!root) return;

    const shop = root.dataset.shop || window.Shopify?.shop || "";
    let customerEmail = (root.dataset.customerEmail || localStorage.getItem("rl_reward_email") || "").trim().toLowerCase();
    const appUrl = (root.dataset.appUrl || "https://review-lift-miki.ecomfixr.com").replace(/\/$/, "");

    const launcher = root.querySelector(".rl-reward-launcher");
    const overlay = root.querySelector(".rl-reward-modal-overlay");
    const closeBtn = root.querySelector(".rl-modal-close");
    const pointsCountEl = root.querySelector(".rl-points-count");
    const pointsUnitEl = root.querySelector(".rl-points-unit");
    const customerTagEl = root.querySelector(".rl-customer-tag");
    const launcherBadge = root.querySelector(".rl-launcher-badge");
    const tiersContainer = root.querySelector(".rl-tiers-container");
    const activeCouponsSection = root.querySelector(".rl-active-coupons-section");
    const couponsContainer = root.querySelector(".rl-coupons-container");
    const earnTextEl = root.querySelector(".rl-earn-text");
    const guestBox = root.querySelector(".rl-guest-login-box");
    const guestInput = root.querySelector(".rl-guest-email");
    const lookupBtn = root.querySelector(".rl-lookup-btn");

    let currentBalance = 0;
    let pointSettings = null;

    const openModal = () => {
      overlay.style.display = "flex";
      loadCustomerPoints();
    };

    const closeModal = () => {
      overlay.style.display = "none";
    };

    if (launcher) launcher.addEventListener("click", openModal);
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModal();
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.style.display !== "none") {
        closeModal();
      }
    });

    if (lookupBtn && guestInput) {
      lookupBtn.addEventListener("click", () => {
        const email = guestInput.value.trim().toLowerCase();
        if (email && email.includes("@")) {
          customerEmail = email;
          localStorage.setItem("rl_reward_email", email);
          if (customerTagEl) customerTagEl.textContent = email;
          loadCustomerPoints();
        }
      });
    }

    const loadCustomerPoints = async () => {
      if (!shop) return;
      try {
        const url = `${appUrl}/api/reward-points?shop=${encodeURIComponent(shop)}&email=${encodeURIComponent(customerEmail)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data.ok || !data.enabled) {
          if (launcher) launcher.style.display = "none";
          return;
        }

        pointSettings = data;
        currentBalance = data.account?.pointsBalance || 0;

        if (pointsCountEl) pointsCountEl.textContent = currentBalance.toLocaleString();
        if (pointsUnitEl) pointsUnitEl.textContent = data.pointUnitName || "Points";
        if (launcherBadge && currentBalance > 0) {
          launcherBadge.textContent = currentBalance.toLocaleString();
          launcherBadge.style.display = "inline-flex";
        }

        if (earnTextEl) {
          const rate = data.pointsPerDollar || 1;
          earnTextEl.textContent = `Earn ${rate} ${data.pointUnitName || "point"}${rate > 1 ? "s" : ""} for every $1 spent on all store purchases.`;
        }

        renderTiers(data.redemptionTiers || []);
        renderActiveCoupons(data.activeCoupons || []);
      } catch (err) {
        console.warn("Reward points load error:", err);
        if (tiersContainer) {
          tiersContainer.innerHTML = '<div style="padding: 12px; color: #64748b; font-size: 13px;">Unable to load rewards right now.</div>';
        }
      }
    };

    const renderTiers = (tiers) => {
      if (!tiersContainer) return;
      if (!tiers.length) {
        tiersContainer.innerHTML = '<div style="padding: 12px; color: #64748b; font-size: 13px;">No redemption tiers configured.</div>';
        return;
      }

      tiersContainer.innerHTML = tiers
        .map((tier, index) => {
          const canRedeem = customerEmail && currentBalance >= tier.points;
          const discountLabel = tier.type === "PERCENTAGE" ? `${tier.value}% Off Discount` : `$${tier.value} Off Discount`;

          return `
            <div class="rl-tier-card" data-tier-index="${index}">
              <div class="rl-tier-info">
                <h5>${discountLabel}</h5>
                <span>${tier.points.toLocaleString()} ${pointSettings?.pointUnitName || "points"} required</span>
              </div>
              <button
                type="button"
                class="rl-redeem-btn"
                data-tier-index="${index}"
                data-points="${tier.points}"
                ${!canRedeem ? "disabled" : ""}
              >
                ${
                  !customerEmail
                    ? "Enter email above"
                    : canRedeem
                    ? `Redeem (${tier.label || discountLabel})`
                    : `Need ${tier.points - currentBalance} more`
                }
              </button>
            </div>
          `;
        })
        .join("");

      // Bind redeem click events
      tiersContainer.querySelectorAll(".rl-redeem-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const tierIndex = Number(btn.dataset.tierIndex);
          redeemTier(tierIndex, btn);
        });
      });
    };

    const renderActiveCoupons = (coupons) => {
      if (!activeCouponsSection || !couponsContainer) return;
      if (!coupons || !coupons.length) {
        activeCouponsSection.style.display = "none";
        return;
      }

      activeCouponsSection.style.display = "block";
      couponsContainer.innerHTML = coupons
        .map((c) => {
          const disc = c.discountType === "PERCENTAGE" ? `${c.discountValue}% off` : `$${c.discountValue} off`;
          return `
            <div class="rl-coupon-card">
              <div>
                <div class="rl-coupon-code">${c.code}</div>
                <span style="font-size: 11px; color: #047857;">${disc} · Active</span>
              </div>
              <button type="button" class="rl-coupon-copy-btn" data-code="${c.code}">Copy Code</button>
            </div>
          `;
        })
        .join("");

      couponsContainer.querySelectorAll(".rl-coupon-copy-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const code = btn.dataset.code;
          navigator.clipboard.writeText(code).then(() => {
            const original = btn.textContent;
            btn.textContent = "Copied! ✓";
            setTimeout(() => { btn.textContent = original; }, 2000);
          });
        });
      });
    };

    const redeemTier = async (tierIndex, btnEl) => {
      if (!customerEmail || !shop) return;
      btnEl.disabled = true;
      const originalText = btnEl.textContent;
      btnEl.textContent = "Generating Coupon...";

      try {
        const res = await fetch(`${appUrl}/api/reward-points`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shop,
            email: customerEmail,
            intent: "redeem",
            tierIndex,
          }),
        });

        const data = await res.json();
        if (!data.ok) {
          alert(data.error || "Failed to redeem points");
          btnEl.disabled = false;
          btnEl.textContent = originalText;
          return;
        }

        // Show success
        btnEl.textContent = "Redeemed! ✓";
        loadCustomerPoints();
      } catch (err) {
        console.error("Redemption error:", err);
        btnEl.disabled = false;
        btnEl.textContent = originalText;
        alert("Failed to redeem points. Please try again.");
      }
    };

    // Auto-fetch on page load if email available
    loadCustomerPoints();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initRewardWidget);
  } else {
    initRewardWidget();
  }
})();
