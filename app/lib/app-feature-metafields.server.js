import { PLAN_CODES, isPlanAtLeast } from "./plans.js";

const FEATURE_NAMESPACE = "ecom_reviewer";
const STAR_BADGE_KEY = "star_badge_available";
const STAR_BADGE_SETTINGS_KEY = "star_badge_settings";
const REVIEW_VIBE_KEY = "review_vibe_available";
const VIDEO_REVIEWS_KEY = "video_reviews_available";
const VIDEO_REVIEWS_SETTINGS_KEY = "video_reviews_settings";
const REVIEW_REWARD_SETTINGS_KEY = "review_reward_settings";
const REVIEW_SECTION_SETTINGS_KEY = "review_section_settings";

export const DEFAULT_REVIEW_SECTION_SETTINGS = {
  cardLayout: "layout-1",
  carouselAutoplay: true,
  carouselSpeed: 5,
  infiniteSpeed: 5,
};

export const DEFAULT_REVIEW_REWARD_SETTINGS = {
  accentColor: "#18B487",
  buttonLabel: "Apply now",
  codePrefix: "",
  couponLifetimeDays: 30,
  discountCode: "",
  discountValue: 20,
  enabled: false,
  generateUniqueCode: true,
  heading: "Congratulations, you got [[percentage]] off",
  imageId: "",
  imageUrl: "",
  message: "Thank you for sharing your experience! Enjoy a discount on your next purchase.",
  redirectPath: "/collections/all",
};

export const DEFAULT_VIDEO_REVIEW_SETTINGS = {
  autoplay: true,
  autoplaySpeed: 5,
  backgroundColor: "#E9FFF2",
  borderRadius: 24,
  cardBackground: "#D9F7E5",
  desktopCards: 5,
  heading: "Video reviews",
  subheading: "Real stories from our customers",
  layoutStyle: "layout-1",
  mobileCards: 1,
  scrollSpeed: 40,
  starColor: "#0B6547",
  textColor: "#17231D",
};

export const DEFAULT_STAR_BADGE_SETTINGS = {
  alignment: "flex-start",
  badgeStyle: "style-1",
  fontSize: 18,
  mutedTextColor: "#4B5563",
  showDivider: true,
  starColor: "#F5AA12",
  starSize: 18,
  textColor: "#1F2933",
};

const getJsonSetting = async (admin, key, defaults) => {
  const response = await admin.graphql(`
    #graphql
    query AppWidgetSettings {
      currentAppInstallation {
        metafield(namespace: "${FEATURE_NAMESPACE}", key: "${key}") { value }
      }
    }
  `);
  const json = await response.json();
  const value = json.data?.currentAppInstallation?.metafield?.value;
  if (!value) return defaults;
  try { return { ...defaults, ...JSON.parse(value) }; } catch { return defaults; }
};

const saveJsonSetting = async (admin, key, settings) => {
  const installationResponse = await admin.graphql(`
    #graphql
    query AppWidgetSettingsOwner { currentAppInstallation { id } }
  `);
  const installationJson = await installationResponse.json();
  const ownerId = installationJson.data?.currentAppInstallation?.id;
  if (!ownerId) throw new Error("Could not find current app installation.");
  const response = await admin.graphql(
    `#graphql
    mutation SaveAppWidgetSettings($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { field message } }
    }`,
    { variables: { metafields: [{
      key, namespace: FEATURE_NAMESPACE, ownerId, type: "json", value: JSON.stringify(settings),
    }] } },
  );
  const json = await response.json();
  const errors = json.data?.metafieldsSet?.userErrors || [];
  if (errors.length) throw new Error(errors.map((error) => error.message).join(", "));
  return settings;
};

export const getStarBadgeSettings = (admin) =>
  getJsonSetting(admin, STAR_BADGE_SETTINGS_KEY, DEFAULT_STAR_BADGE_SETTINGS);

export const saveStarBadgeSettings = (admin, settings) =>
  saveJsonSetting(admin, STAR_BADGE_SETTINGS_KEY, settings);

export const getReviewSectionSettings = async (admin) => {
  const settings = await getJsonSetting(
    admin,
    REVIEW_SECTION_SETTINGS_KEY,
    DEFAULT_REVIEW_SECTION_SETTINGS,
  );
  return {
    ...settings,
    infiniteSpeed: Math.max(
      3,
      Math.min(12, Number(settings.infiniteSpeed) || 5),
    ),
  };
};

export const saveReviewSectionSettings = (admin, settings) =>
  saveJsonSetting(admin, REVIEW_SECTION_SETTINGS_KEY, settings);

export const getReviewRewardSettings = async (admin) => {
  const settings = await getJsonSetting(
    admin,
    REVIEW_REWARD_SETTINGS_KEY,
    DEFAULT_REVIEW_REWARD_SETTINGS,
  );
  return {
    ...settings,
    codePrefix: "",
    couponLifetimeDays: Math.max(
      1,
      Math.min(365, Number(settings.couponLifetimeDays) || 30),
    ),
    discountValue: Math.max(
      1,
      Math.min(100, Number(settings.discountValue) || 20),
    ),
    heading:
      settings.heading === "Congratulations, you got 25% off" ||
      settings.heading === "Congratulations, you got 20% off"
        ? DEFAULT_REVIEW_REWARD_SETTINGS.heading
        : settings.heading,
  };
};

export const saveReviewRewardSettings = (admin, settings) =>
  saveJsonSetting(admin, REVIEW_REWARD_SETTINGS_KEY, settings);

export const getVideoReviewSettings = async (admin) => {
  const response = await admin.graphql(`
    #graphql
    query VideoReviewSettings {
      currentAppInstallation {
        metafield(namespace: "${FEATURE_NAMESPACE}", key: "${VIDEO_REVIEWS_SETTINGS_KEY}") {
          value
        }
      }
    }
  `);
  const json = await response.json();
  const value = json.data?.currentAppInstallation?.metafield?.value;

  if (!value) return DEFAULT_VIDEO_REVIEW_SETTINGS;

  try {
    return { ...DEFAULT_VIDEO_REVIEW_SETTINGS, ...JSON.parse(value) };
  } catch {
    return DEFAULT_VIDEO_REVIEW_SETTINGS;
  }
};

export const saveVideoReviewSettings = async (admin, settings) => {
  const installationResponse = await admin.graphql(`
    #graphql
    query VideoReviewSettingsOwner { currentAppInstallation { id } }
  `);
  const installationJson = await installationResponse.json();
  const ownerId = installationJson.data?.currentAppInstallation?.id;
  if (!ownerId) throw new Error("Could not find current app installation.");

  const response = await admin.graphql(
    `#graphql
    mutation SaveVideoReviewSettings($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { field message } }
    }`,
    { variables: { metafields: [{
      key: VIDEO_REVIEWS_SETTINGS_KEY,
      namespace: FEATURE_NAMESPACE,
      ownerId,
      type: "json",
      value: JSON.stringify(settings),
    }] } },
  );
  const json = await response.json();
  const errors = json.data?.metafieldsSet?.userErrors || [];
  if (errors.length) throw new Error(errors.map((error) => error.message).join(", "));
  return settings;
};

export const getStarBadgeAvailableForPlan = (planCode) =>
  isPlanAtLeast(planCode, PLAN_CODES.GROWTH);

export const getReviewVibeAvailableForPlan = (planCode) =>
  isPlanAtLeast(planCode, PLAN_CODES.GROWTH);

export const syncStarBadgeAvailability = async (admin, planCode) => {
  const appInstallationResponse = await admin.graphql(
    `#graphql
    query CurrentAppInstallationForFeatures {
      currentAppInstallation {
        id
      }
    }`,
  );
  const appInstallationJson = await appInstallationResponse.json();
  const ownerId = appInstallationJson.data?.currentAppInstallation?.id;

  if (!ownerId) {
    throw new Error("Could not find current app installation.");
  }

  const metafieldsResponse = await admin.graphql(
    `#graphql
    mutation SyncReviewFeatureMetafields($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            key: STAR_BADGE_KEY,
            namespace: FEATURE_NAMESPACE,
            ownerId,
            type: "boolean",
            value: String(getStarBadgeAvailableForPlan(planCode)),
          },
          {
            key: REVIEW_VIBE_KEY,
            namespace: FEATURE_NAMESPACE,
            ownerId,
            type: "boolean",
            value: String(getReviewVibeAvailableForPlan(planCode)),
          },
          {
            key: VIDEO_REVIEWS_KEY,
            namespace: FEATURE_NAMESPACE,
            ownerId,
            type: "boolean",
            value: String(getReviewVibeAvailableForPlan(planCode)),
          },
        ],
      },
    },
  );
  const metafieldsJson = await metafieldsResponse.json();
  const errors = metafieldsJson.data?.metafieldsSet?.userErrors || [];

  if (errors.length) {
    throw new Error(errors.map((error) => error.message).join(", "));
  }
};
