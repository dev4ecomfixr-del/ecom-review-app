export const PLAN_CODES = {
  STARTER: "STARTER",
  GROWTH: "GROWTH",
  PRO: "PRO",
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
      "Review dashboard",
      "Publish and hide reviews",
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

export const DEFAULT_PLAN = PLANS[0];

export const PLAN_RANKS = {
  [PLAN_CODES.STARTER]: 0,
  [PLAN_CODES.GROWTH]: 1,
  [PLAN_CODES.PRO]: 2,
};

export const getPlanByCode = (code) =>
  PLANS.find((plan) => plan.code === code) || DEFAULT_PLAN;

export const isPlanAtLeast = (code, minimumCode) =>
  (PLAN_RANKS[code] ?? PLAN_RANKS[DEFAULT_PLAN.code]) >=
  (PLAN_RANKS[minimumCode] ?? PLAN_RANKS[DEFAULT_PLAN.code]);

export const getPlanUsageLabel = (plan, reviewCount = 0) => {
  if (plan.reviewLimit === null) {
    return `${reviewCount} reviews used · unlimited`;
  }

  return `${reviewCount}/${plan.reviewLimit} reviews used`;
};

export const isValidPlanCode = (code) =>
  PLANS.some((plan) => plan.code === code);
