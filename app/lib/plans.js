export const PLAN_CODES = {
  STARTER: "STARTER",
  GROWTH: "GROWTH",
  PRO: "PRO",
  CUSTOM: "CUSTOM",
  DISABLED: "DISABLED",
};

export const PLANS = [
  {
    code: PLAN_CODES.STARTER,
    name: "Starter",
    price: "Free",
    reviewLimit: 10,
    description: "Start collecting customer reviews on your storefront.",
    badge: "Launch",
    tone: "starter",
    features: [
      "Up to 10 reviews",
      "Storefront review section",
      "Dashboard",
      "Reply to customer reviews",
      "Post-review discount popup",
    ],
  },
  {
    code: PLAN_CODES.GROWTH,
    name: "Growth",
    price: "$9",
    suffix: "/mo",
    reviewLimit: 50,
    description: "For stores ready to build trust with stronger review tools.",
    badge: "Popular",
    tone: "growth",
    features: [
      "Up to 50 reviews",
      "Review vibe storefront block",
      "Star badge widget",
      "Photo review ready layout",
      "Review request workflow",
      "Priority moderation queue",
    ],
  },
  {
    code: PLAN_CODES.PRO,
    name: "Pro",
    price: "$19",
    suffix: "/mo",
    reviewLimit: null,
    description: "Unlimited reviews for scaling storefronts.",
    badge: "Unlimited",
    tone: "pro",
    features: [
      "Unlimited reviews",
      "Review vibe storefront block",
      "Review analytics insights",
      "Product-level review controls",
      "Premium support",
    ],
  },
];

export const DEFAULT_PLAN =
  PLANS.find((plan) => plan.code === PLAN_CODES.PRO) || PLANS[2];

export const PLAN_RANKS = {
  [PLAN_CODES.DISABLED]: -1,
  [PLAN_CODES.STARTER]: 0,
  [PLAN_CODES.GROWTH]: 1,
  [PLAN_CODES.PRO]: 2,
  [PLAN_CODES.CUSTOM]: 3,
};

export const getBillingCycleWindow = (referenceDate = new Date()) => {
  const now = new Date();
  const ref = new Date(referenceDate || now);
  const dayOfMonth = Math.min(ref.getDate(), 28);

  let cycleStart = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  if (cycleStart > now) {
    cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, dayOfMonth);
  }

  const cycleEnd = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, dayOfMonth);

  const formatter = new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return {
    cycleStart,
    cycleEnd,
    nextResetFormatted: formatter.format(cycleEnd),
    cycleStartFormatted: formatter.format(cycleStart),
  };
};

export const getPlanByCode = (code) => {
  if (!code) return { ...DEFAULT_PLAN, isAccessEnabled: true };

  const codeStr = String(code).trim();
  const upper = codeStr.toUpperCase();

  if (upper === "DISABLED" || upper.startsWith("DISABLED:") || upper.startsWith("DISABLED_")) {
    const underlyingCode = upper.includes(":") || upper.includes("_")
      ? codeStr.slice(upper.indexOf(":") + 1 || upper.indexOf("_") + 1)
      : PLAN_CODES.PRO;
    const basePlan = getPlanByCode(underlyingCode || PLAN_CODES.PRO);

    return {
      ...basePlan,
      code: codeStr,
      baseCode: PLAN_CODES.DISABLED,
      name: "Access Off",
      isAccessEnabled: false,
      activePlanCode: underlyingCode || PLAN_CODES.PRO,
      description: "Store app access is currently turned off.",
      badge: "Off",
      tone: "starter",
    };
  }

  if (upper.startsWith("CUSTOM:") || upper.startsWith("CUSTOM_") || upper === "CUSTOM") {
    let customLimit = null;
    let customPrice = "Custom";

    if (codeStr.includes(":") || codeStr.includes("_")) {
      const parts = codeStr.split(/[:_]/);
      const parsed = parseInt(parts[1], 10);
      if (!isNaN(parsed) && parsed > 0) {
        customLimit = parsed;
      }
      if (parts[2]) {
        customPrice = parts[2].startsWith("$") ? parts[2] : `$${parts[2]}`;
      }
    }

    return {
      code: codeStr,
      baseCode: PLAN_CODES.CUSTOM,
      isAccessEnabled: true,
      name: customLimit ? `Custom (${customLimit}/mo)` : "Custom Plan",
      price: customPrice,
      suffix: "/mo",
      interval: "MONTHLY",
      reviewLimit: customLimit,
      description: customLimit
        ? `Dedicated monthly recurring package with ${customLimit} reviews every month.`
        : "Dedicated monthly recurring package.",
      badge: customLimit ? `${customLimit} /mo` : "Custom /mo",
      tone: "pro",
      features: [
        customLimit ? `${customLimit} reviews every month` : "Custom monthly reviews quota",
        "Monthly recurring quota reset",
        "Storefront review section",
        "Review vibe storefront block",
        "Star badge widget",
        "Video reviews layout",
        "Review analytics insights",
        "Post-review discount popup",
        "Priority moderation queue",
        "Premium support",
      ],
    };
  }

  const found = PLANS.find((plan) => plan.code === upper) || DEFAULT_PLAN;
  return {
    ...found,
    isAccessEnabled: true,
  };
};

export const isPlanAtLeast = (code, minimumCode) => {
  const upper = String(code || "").toUpperCase();
  if (upper.startsWith("DISABLED")) return false;

  const baseCode = upper.startsWith("CUSTOM")
    ? PLAN_CODES.CUSTOM
    : code;
  return (
    (PLAN_RANKS[baseCode] ?? PLAN_RANKS[DEFAULT_PLAN.code]) >=
    (PLAN_RANKS[minimumCode] ?? PLAN_RANKS[DEFAULT_PLAN.code])
  );
};

export const getRemainingReviews = (plan, reviewCount = 0) => {
  if (!plan || plan.reviewLimit === null) {
    return null; // Unlimited
  }
  return Math.max(0, plan.reviewLimit - reviewCount);
};

export const getPlanUsageLabel = (plan, reviewCount = 0, nextResetDate = null) => {
  if (plan && plan.isAccessEnabled === false) {
    return "App access is currently disabled for this store";
  }
  if (!plan || plan.reviewLimit === null) {
    return `${reviewCount} reviews used this month · Unlimited`;
  }
  const remaining = getRemainingReviews(plan, reviewCount);
  const resetNote = nextResetDate ? ` · Resets ${nextResetDate}` : "";
  return `${reviewCount}/${plan.reviewLimit} used this month · ${remaining} remaining${resetNote}`;
};

export const isValidPlanCode = (code) => {
  if (!code) return false;
  const upper = String(code).toUpperCase().trim();
  if (
    upper === "DISABLED" ||
    upper.startsWith("DISABLED:") ||
    upper.startsWith("DISABLED_") ||
    upper.startsWith("CUSTOM:") ||
    upper.startsWith("CUSTOM_") ||
    upper === "CUSTOM"
  ) {
    return true;
  }
  return PLANS.some((plan) => plan.code === upper);
};
