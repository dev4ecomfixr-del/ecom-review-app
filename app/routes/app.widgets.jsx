import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  DEFAULT_PLAN,
  PLAN_CODES,
  getPlanByCode,
  isPlanAtLeast,
} from "../lib/plans";
import {
  DEFAULT_VIDEO_REVIEW_SETTINGS,
  DEFAULT_STAR_BADGE_SETTINGS,
  getStarBadgeSettings,
  getVideoReviewSettings,
  saveVideoReviewSettings,
  saveStarBadgeSettings,
  syncStarBadgeAvailability,
} from "../lib/app-feature-metafields.server";
import { getShopPlanCode } from "../lib/shop-plans.server";
import styles from "../styles/widgets.module.css";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const planCode = await getShopPlanCode(session.shop);
  const plan = getPlanByCode(planCode || DEFAULT_PLAN.code);

  try {
    await syncStarBadgeAvailability(admin, plan.code);
  } catch (error) {
    console.error("Failed to sync star badge availability", error);
  }

  return {
    // eslint-disable-next-line no-undef
    apiKey: process.env.SHOPIFY_API_KEY || "",
    canUseStarBadge: isPlanAtLeast(plan.code, PLAN_CODES.GROWTH),
    planName: plan.name,
    shop: session.shop,
    videoReviewSettings: await getVideoReviewSettings(admin),
    starBadgeSettings: await getStarBadgeSettings(admin),
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save-star-badge-settings") {
    const raw = JSON.parse(String(formData.get("settings") || "{}"));
    const validAlignments = new Set(["flex-start", "center", "flex-end"]);
    const settings = {
      ...DEFAULT_STAR_BADGE_SETTINGS,
      alignment: validAlignments.has(raw.alignment) ? raw.alignment : "flex-start",
      badgeStyle: ["style-1", "style-2", "style-3", "style-4", "style-5", "style-6", "style-7", "style-8", "style-9"].includes(raw.badgeStyle)
        ? raw.badgeStyle
        : "style-1",
      fontSize: Math.max(18, Math.min(56, Number(raw.fontSize) || 18)),
      mutedTextColor: String(raw.mutedTextColor || "#4B5563").slice(0, 7),
      showDivider: Boolean(raw.showDivider),
      starColor: String(raw.starColor || "#F5AA12").slice(0, 7),
      starSize: Math.max(18, Math.min(56, Number(raw.starSize) || 18)),
      textColor: String(raw.textColor || "#1F2933").slice(0, 7),
    };
    await saveStarBadgeSettings(admin, settings);
    return { ok: true, widget: "star-badge", settings };
  }

  if (intent !== "save-video-settings") return { ok: false };

  const rawSettings = JSON.parse(String(formData.get("settings") || "{}"));
  const settings = {
    ...DEFAULT_VIDEO_REVIEW_SETTINGS,
    autoplay: Boolean(rawSettings.autoplay),
    autoplaySpeed: Math.max(3, Math.min(12, Number(rawSettings.autoplaySpeed) || 5)),
    backgroundColor: String(rawSettings.backgroundColor || "#E9FFF2").slice(0, 7),
    borderRadius: Math.max(0, Math.min(40, Number(rawSettings.borderRadius) || 0)),
    cardBackground: String(rawSettings.cardBackground || "#D9F7E5").slice(0, 7),
    desktopCards: Math.max(3, Math.min(6, Number(rawSettings.desktopCards) || 5)),
    heading: String(rawSettings.heading || "Video reviews").trim().slice(0, 80),
    subheading: String(
      rawSettings.subheading ?? DEFAULT_VIDEO_REVIEW_SETTINGS.subheading,
    ).trim().slice(0, 160),
    layoutStyle: ["layout-1", "layout-2", "layout-3"].includes(rawSettings.layoutStyle)
      ? rawSettings.layoutStyle
      : "layout-1",
    mobileCards: Math.max(1, Math.min(2, Number(rawSettings.mobileCards) || 1)),
    scrollSpeed: Math.max(10, Math.min(100, Number(rawSettings.scrollSpeed) || 40)),
    starColor: String(rawSettings.starColor || "#0B6547").slice(0, 7),
    textColor: String(rawSettings.textColor || "#17231D").slice(0, 7),
  };
  await saveVideoReviewSettings(admin, settings);
  return { ok: true, settings };
};

export default function Widgets() {
  const {
    apiKey,
    canUseStarBadge,
    planName,
    shop,
    starBadgeSettings,
    videoReviewSettings,
  } = useLoaderData();
  const starSettingsFetcher = useFetcher();
  const videoSettingsFetcher = useFetcher();
  const [settings, setSettings] = useState(starBadgeSettings);
  const [starSettingsDirty, setStarSettingsDirty] = useState(false);
  const [videoSettings, setVideoSettings] = useState(videoReviewSettings);
  const [videoSettingsDirty, setVideoSettingsDirty] = useState(false);
  const [videoPreviewPage, setVideoPreviewPage] = useState(0);
  const [videoPreviewDevice, setVideoPreviewDevice] = useState("desktop");
  const videoStories = [
    ["Ava Smith", "#bdd8cf"], ["Melania Green", "#b98d6a"],
    ["Sarah Mansfield", "#d8c8a4"], ["Elena Petrova", "#8da4ae"],
    ["Emerson Terry", "#d7c9b9"], ["Noah Williams", "#9fc8b6"],
    ["Mia Johnson", "#c9a889"], ["Liam Brown", "#aebfd0"],
    ["Sophia Davis", "#d6b9a4"], ["James Wilson", "#a7c9bd"],
    ["Olivia Taylor", "#d8c8a4"], ["Ethan Moore", "#91adb5"],
  ];

  const updateSetting = (key, value) => {
    setSettings((currentSettings) => ({
      ...currentSettings,
      [key]: value,
    }));
    setStarSettingsDirty(true);
  };
  const updateVideoSetting = (key, value) => {
    setVideoSettings((currentSettings) => ({
      ...currentSettings,
      [key]: value,
    }));
    setVideoSettingsDirty(true);
    setVideoPreviewPage(0);
  };
  const videoPreviewCardCount = videoPreviewDevice === "desktop"
    ? videoSettings.desktopCards
    : videoSettings.mobileCards;
  const videoPageCount = Math.ceil(videoStories.length / videoPreviewCardCount);
  const changeVideoPreviewPage = (direction) => {
    setVideoPreviewPage((page) => (page + direction + videoPageCount) % videoPageCount);
  };

  useEffect(() => {
    if (!videoSettings.autoplay || !canUseStarBadge || videoSettings.layoutStyle === "layout-3") return undefined;
    const autoplayId = window.setInterval(
      () => setVideoPreviewPage((page) => (page + 1) % videoPageCount),
      videoSettings.autoplaySpeed * 1000,
    );
    return () => window.clearInterval(autoplayId);
  }, [canUseStarBadge, videoPageCount, videoSettings.autoplay, videoSettings.autoplaySpeed, videoSettings.layoutStyle]);

  useEffect(() => {
    if (videoSettingsFetcher.data?.ok) setVideoSettingsDirty(false);
  }, [videoSettingsFetcher.data]);

  useEffect(() => {
    if (starSettingsFetcher.data?.ok) setStarSettingsDirty(false);
  }, [starSettingsFetcher.data]);

  return (
    <s-page heading="Widgets" inlineSize="large">
      <div className={styles.widgetsLayout}>
        <main className={styles.widgetsMain}>
          <s-section heading="Star badge widget">
        <div className={styles.hero}>
          <p className={styles.eyebrow}>Product page block</p>
          <h2>Star badge controls</h2>
          <p>
            Star badge is available from the Growth pack. Use it on product
            pages to show review trust signals near the product title.
          </p>
        </div>

        {!canUseStarBadge ? (
          <div className={styles.upgradeNotice}>
            <span>Growth feature</span>
            <h3>Upgrade to Growth to use Star badge</h3>
            <p>
              Your current plan is {planName}. Star badge controls and theme
              setup are unlocked on Growth and Pro.
            </p>
            <s-link href="/app/pricing">View Growth pack</s-link>
          </div>
        ) : null}

        <div className={styles.controlLayout}>
          <div
            className={`${styles.previewPanel} ${
              !canUseStarBadge ? styles.lockedPanel : ""
            }`}
          >
            <span className={styles.panelLabel}>Live style preview</span>
            <div
              className={`${styles.badgePreview} ${
                settings.badgeStyle === "style-2" ? styles.badgeStyleTwo : ""
              } ${settings.badgeStyle === "style-3" ? styles.badgeStyleThree : ""}`}
              data-badge-preview-style={settings.badgeStyle}
              style={{ justifyContent: settings.alignment }}
            >
              <span
                className={styles.previewStars}
                style={{
                  color: settings.starColor,
                  fontSize: `${settings.starSize}px`,
                }}
              >
                ★★★★★
              </span>
              <strong
                data-shine-text="4.9/5 ratings"
                style={{
                  color: settings.textColor,
                  fontSize: `${settings.fontSize}px`,
                }}
              >
                4.9/5 ratings
              </strong>
              <em
                data-shine-text="based on 12,000+ customers"
                className={!settings.showDivider ? styles.noDivider : ""}
                style={{
                  color: settings.mutedTextColor,
                  fontSize: `${Math.round(settings.fontSize * 0.62)}px`,
                }}
              >
                based on 12,000+ customers
              </em>
            </div>
          </div>

          <div className={styles.optionGrid}>
            <label className={styles.optionCard}>
              <span>Style</span>
              <h3>Badge style</h3>
              <select
                disabled={!canUseStarBadge}
                value={settings.badgeStyle}
                onChange={(event) => updateSetting("badgeStyle", event.target.value)}
              >
                <option value="style-1">Style 1 · Horizontal</option>
                <option value="style-2">Style 2 · Stacked</option>
                <option value="style-3">Style 3 · Compact pill</option>
                <option value="style-4">Style 4 · Minimal underline</option>
                <option value="style-5">Style 5 · Review card</option>
                <option value="style-6">Style 6 · Score spotlight</option>
                <option value="style-7">Style 7 · Pulsing stars</option>
                <option value="style-8">Style 8 · Shimmer sweep</option>
                <option value="style-9">Style 9 · Floating glow</option>
              </select>
              <p>Choose the storefront badge appearance.</p>
            </label>
            <label className={styles.optionCard}>
              <span>Color</span>
              <h3>Star color</h3>
              <div className={styles.controlRow}>
                <input
                  disabled={!canUseStarBadge}
                  type="color"
                  value={settings.starColor}
                  onChange={(event) =>
                    updateSetting("starColor", event.target.value)
                  }
                />
                <p>{settings.starColor}</p>
              </div>
            </label>

            <label className={styles.optionCard}>
              <span>Color</span>
              <h3>Text color</h3>
              <div className={styles.controlRow}>
                <input
                  disabled={!canUseStarBadge}
                  type="color"
                  value={settings.textColor}
                  onChange={(event) =>
                    updateSetting("textColor", event.target.value)
                  }
                />
                <p>{settings.textColor}</p>
              </div>
            </label>

            <label className={styles.optionCard}>
              <span>Color</span>
              <h3>Customer text</h3>
              <div className={styles.controlRow}>
                <input
                  disabled={!canUseStarBadge}
                  type="color"
                  value={settings.mutedTextColor}
                  onChange={(event) =>
                    updateSetting("mutedTextColor", event.target.value)
                  }
                />
                <p>{settings.mutedTextColor}</p>
              </div>
            </label>

            <label className={styles.optionCard}>
              <span>Size</span>
              <h3>Font size</h3>
              <input
                disabled={!canUseStarBadge}
                max="56"
                min="18"
                type="range"
                value={settings.fontSize}
                onChange={(event) =>
                  updateSetting("fontSize", Number(event.target.value))
                }
              />
              <p>{settings.fontSize}px rating text</p>
            </label>

            <label className={styles.optionCard}>
              <span>Size</span>
              <h3>Star size</h3>
              <input
                disabled={!canUseStarBadge}
                max="56"
                min="18"
                type="range"
                value={settings.starSize}
                onChange={(event) =>
                  updateSetting("starSize", Number(event.target.value))
                }
              />
              <p>{settings.starSize}px stars</p>
            </label>

            <label className={styles.optionCard}>
              <span>Layout</span>
              <h3>Alignment</h3>
              <select
                disabled={!canUseStarBadge}
                value={settings.alignment}
                onChange={(event) =>
                  updateSetting("alignment", event.target.value)
                }
              >
                <option value="flex-start">Left</option>
                <option value="center">Center</option>
                <option value="flex-end">Right</option>
              </select>
              <p>Controls badge placement inside the product block.</p>
            </label>

            <label className={`${styles.optionCard} ${styles.toggleCard}`}>
              <span>Layout</span>
              <h3>Divider</h3>
              <div className={styles.checkboxRow}>
                <input
                  checked={settings.showDivider}
                  disabled={!canUseStarBadge}
                  type="checkbox"
                  onChange={(event) =>
                    updateSetting("showDivider", event.target.checked)
                  }
                />
                <p>Show divider before customer count</p>
              </div>
            </label>
          </div>
          <div className={styles.saveBar}>
            <div>
              <strong>Star badge settings</strong>
              <p>
                {starSettingsDirty
                  ? "You have unsaved changes."
                  : starSettingsFetcher.data?.ok
                    ? "Saved successfully. Storefront settings are updated."
                    : "Settings are saved."}
              </p>
            </div>
            <s-button
              disabled={!canUseStarBadge || !starSettingsDirty || starSettingsFetcher.state !== "idle"}
              loading={starSettingsFetcher.state !== "idle"}
              onClick={() => starSettingsFetcher.submit(
                { intent: "save-star-badge-settings", settings: JSON.stringify(settings) },
                { method: "post" },
              )}
              variant="primary"
            >
              Save settings
            </s-button>
          </div>
        </div>
          </s-section>

          <s-section heading="Video reviews widget">
        <div className={styles.storiesIntro}>
          <div>
            <p className={styles.eyebrow}>Storefront media carousel</p>
            <h2>Video reviews</h2>
            <p>
              Turn published photo and video reviews into a social-proof
              carousel. The widget automatically uses your latest reviews.
            </p>
          </div>
          <s-badge tone={canUseStarBadge ? "success" : "info"}>
            {canUseStarBadge ? "Available" : "Growth feature"}
          </s-badge>
        </div>

        <div className={styles.previewToolbar}>
          <span>Preview</span>
          <div className={styles.deviceButtons}>
            <button
              aria-label="Desktop preview"
              aria-pressed={videoPreviewDevice === "desktop"}
              className={videoPreviewDevice === "desktop" ? styles.activeDevice : ""}
              onClick={() => { setVideoPreviewDevice("desktop"); setVideoPreviewPage(0); }}
              type="button"
            >
              <span aria-hidden="true" className={styles.desktopIcon} />
              Desktop
            </button>
            <button
              aria-label="Mobile preview"
              aria-pressed={videoPreviewDevice === "mobile"}
              className={videoPreviewDevice === "mobile" ? styles.activeDevice : ""}
              onClick={() => { setVideoPreviewDevice("mobile"); setVideoPreviewPage(0); }}
              type="button"
            >
              <span aria-hidden="true" className={styles.mobileIcon} />
              Mobile
            </button>
          </div>
        </div>
        <div className={styles.previewStage}>
        <div
          className={`${styles.storiesPreview} ${
            !canUseStarBadge ? styles.lockedPanel : ""
          } ${videoPreviewDevice === "mobile" ? styles.mobilePreview : ""} ${
            videoSettings.layoutStyle === "layout-2" ? styles.previewLayoutTwo : ""
          } ${
            videoSettings.layoutStyle === "layout-3" ? styles.previewLayoutThree : ""
          }`}
          style={{
            background: `linear-gradient(145deg, #ffffff 10%, ${videoSettings.backgroundColor} 100%)`,
            borderRadius: `${videoSettings.borderRadius}px`,
            color: videoSettings.textColor,
            "--preview-scroll-duration": `${Math.max(8, Math.round(1200 / videoSettings.scrollSpeed))}s`,
          }}
        >
          <div className={styles.storiesPreviewHeader}>
            <h3 style={{ color: videoSettings.textColor }}>{videoSettings.heading}</h3>
            {videoSettings.subheading ? (
              <p className={styles.storiesSubheading} style={{ color: videoSettings.textColor }}>
                {videoSettings.subheading}
              </p>
            ) : null}
            <p className={styles.storiesRating} style={{ color: videoSettings.textColor }}><span style={{ color: videoSettings.starColor }}>★★★★★</span> 4.82 ★ (84)</p>
          </div>
          <div className={styles.storyCards} style={{ "--preview-columns": videoPreviewCardCount }}>
            {(videoSettings.layoutStyle === "layout-3"
              ? [...videoStories, ...videoStories]
              : videoStories.slice(
                videoPreviewPage * videoPreviewCardCount,
                (videoPreviewPage + 1) * videoPreviewCardCount,
              ))
              .map(([name], index) => (
              <article
                className={styles.storyCard}
                key={name}
                style={{
                  "--story-color": videoSettings.cardBackground,
                  "--story-index": index,
                }}
              >
                <span className={styles.storyPlay}>▶</span>
                <div className={styles.storyCardMeta}>
                  <span style={{ color: videoSettings.starColor }}>★★★★★</span>
                  <strong>{name}</strong>
                </div>
              </article>
            ))}
          </div>
          <div className={styles.storyArrows} hidden={videoSettings.layoutStyle === "layout-3"}>
            <button type="button" onClick={() => changeVideoPreviewPage(-1)} aria-label="Previous preview">‹</button>
            <button type="button" onClick={() => changeVideoPreviewPage(1)} aria-label="Next preview">›</button>
          </div>
        </div>
        </div>

        <div className={styles.videoControls}>
          <label className={styles.optionCard}>
            <span>Style</span><h3>Carousel layout</h3>
            <select
              disabled={!canUseStarBadge}
              value={videoSettings.layoutStyle}
              onChange={(event) => updateVideoSetting("layoutStyle", event.target.value)}
            >
              <option value="layout-1">Layout 1 · Featured center</option>
              <option value="layout-2">Layout 2 · Uniform cards</option>
              <option value="layout-3">Layout 3 · Infinite carousel</option>
            </select>
            <p>Choose the visual style for video cards.</p>
          </label>
          {videoSettings.layoutStyle === "layout-3" ? (
            <label className={styles.optionCard}>
              <span>Layout 3</span><h3>Scrolling speed</h3>
              <input
                disabled={!canUseStarBadge}
                min="10"
                max="100"
                step="10"
                type="range"
                value={videoSettings.scrollSpeed}
                onChange={(event) => updateVideoSetting("scrollSpeed", Number(event.target.value))}
              />
              <p>{videoSettings.scrollSpeed} pixels per second</p>
            </label>
          ) : null}
          <label className={styles.optionCard}>
            <span>Content</span><h3>Heading</h3>
            <input disabled={!canUseStarBadge} type="text" value={videoSettings.heading} onChange={(event) => updateVideoSetting("heading", event.target.value)} />
          </label>
          <label className={styles.optionCard}>
            <span>Content</span><h3>Subheading</h3>
            <input
              disabled={!canUseStarBadge}
              maxLength="160"
              type="text"
              value={videoSettings.subheading}
              onChange={(event) => updateVideoSetting("subheading", event.target.value)}
            />
          </label>
          {[
            ["backgroundColor", "Section background"],
            ["cardBackground", "Card background"],
            ["starColor", "Star color"],
            ["textColor", "Text color"],
          ].map(([key, label]) => (
            <label className={styles.optionCard} key={key}>
              <span>Color</span><h3>{label}</h3>
              <div className={styles.controlRow}>
                <input disabled={!canUseStarBadge} type="color" value={videoSettings[key]} onChange={(event) => updateVideoSetting(key, event.target.value)} />
                <p>{videoSettings[key]}</p>
              </div>
            </label>
          ))}
          <label className={styles.optionCard}>
            <span>Layout</span><h3>Desktop cards</h3>
            <input disabled={!canUseStarBadge} min="3" max="6" type="range" value={videoSettings.desktopCards} onChange={(event) => updateVideoSetting("desktopCards", Number(event.target.value))} />
            <p>{videoSettings.desktopCards} cards per slide</p>
          </label>
          <label className={styles.optionCard}>
            <span>Layout</span><h3>Mobile cards</h3>
            <input disabled={!canUseStarBadge} min="1" max="2" type="range" value={videoSettings.mobileCards} onChange={(event) => updateVideoSetting("mobileCards", Number(event.target.value))} />
            <p>{videoSettings.mobileCards} card{videoSettings.mobileCards === 1 ? "" : "s"} per slide</p>
          </label>
          <label className={styles.optionCard}>
            <span>Style</span><h3>Corner radius</h3>
            <input disabled={!canUseStarBadge} min="0" max="40" type="range" value={videoSettings.borderRadius} onChange={(event) => updateVideoSetting("borderRadius", Number(event.target.value))} />
            <p>{videoSettings.borderRadius}px</p>
          </label>
          <label className={`${styles.optionCard} ${styles.toggleCard}`}>
            <span>Playback</span><h3>Autoplay</h3>
            <div className={styles.checkboxRow}>
              <input checked={videoSettings.autoplay} disabled={!canUseStarBadge} type="checkbox" onChange={(event) => updateVideoSetting("autoplay", event.target.checked)} />
              <p>Automatically play muted videos and advance slides</p>
            </div>
          </label>
          <label className={styles.optionCard}>
            <span>Playback</span><h3>Autoplay speed</h3>
            <input disabled={!canUseStarBadge || !videoSettings.autoplay} min="3" max="12" type="range" value={videoSettings.autoplaySpeed} onChange={(event) => updateVideoSetting("autoplaySpeed", Number(event.target.value))} />
            <p>{videoSettings.autoplaySpeed} seconds</p>
          </label>
        </div>
        <div className={styles.saveBar}>
          <div>
            <strong>Video reviews settings</strong>
            <p>
              {videoSettingsDirty
                ? "You have unsaved changes."
                : videoSettingsFetcher.data?.ok
                  ? "Saved successfully. Storefront settings are updated."
                  : "Settings are saved."}
            </p>
          </div>
          <s-button
            disabled={!canUseStarBadge || !videoSettingsDirty || videoSettingsFetcher.state !== "idle"}
            loading={videoSettingsFetcher.state !== "idle"}
            onClick={() => {
              videoSettingsFetcher.submit(
                { intent: "save-video-settings", settings: JSON.stringify(videoSettings) },
                { method: "post" },
              );
            }}
            variant="primary"
          >
            Save settings
          </s-button>
        </div>

        {!canUseStarBadge ? (
          <div className={styles.upgradeNotice}>
            <span>Growth feature</span>
            <h3>Upgrade to publish Video reviews</h3>
            <p>
              Your current plan is {planName}. The carousel is available on
              Growth and Pro.
            </p>
            <s-link href="/app/pricing">View Growth pack</s-link>
          </div>
        ) : (
          <div className={styles.widgetSetup}>
            <div>
              <strong>Theme editor setup</strong>
              <p>Add the <code>Video reviews</code> app block to any template.</p>
            </div>
            <span>Uses published reviews automatically</span>
          </div>
        )}
          </s-section>
        </main>

        <aside className={styles.widgetsAside}>
          <s-section heading="App embed">
            <div className={styles.statusCard}>
              <span>Theme integration</span>
              <h3>eCom Reviewer</h3>
              <p>
                Enable the app embed once in your live theme, then save the
                Theme Editor.
              </p>
              <s-link
                href={`https://${shop}/admin/themes/current/editor?context=apps&template=index&activateAppId=${apiKey}/app-embed`}
                target="_top"
              >
                Open app embeds
              </s-link>
            </div>
          </s-section>

          <s-section heading="Theme editor">
            <div className={styles.statusCard}>
              <span>{canUseStarBadge ? "Available block" : "Growth feature"}</span>
              <h3>Star badge</h3>
              <p>
                {canUseStarBadge
                  ? "Add "
                  : "Star badge is available from the Growth pack. Upgrade before adding "}
                <code>Star badge</code>
                {canUseStarBadge
                  ? " from the product template app blocks. The settings appear directly in Shopify's theme editor."
                  : " to your product template app blocks."}
              </p>
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
