import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  BUILT_IN_MODERATION_RULES,
  PROTECTED_CRITICISM_TERMS,
  addFilterWord,
  deleteFilterWord,
  getFilterWords,
  getModerationSettings,
  updateModerationRule,
  validateModerationTerm,
} from "../lib/filter-words.server";
import styles from "../styles/filters.module.css";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const [filterWords, moderationSettings] = await Promise.all([
    getFilterWords(session.shop),
    getModerationSettings(session.shop),
  ]);

  return {
    filterWords: filterWords.map((filterWord) => ({
      ...filterWord,
      isAllowed: !validateModerationTerm(filterWord.word).error,
    })),
    builtInRules: BUILT_IN_MODERATION_RULES.map((rule) => ({
      ...rule,
      enabled: moderationSettings[rule.id] !== false,
    })),
    protectedCriticismTerms: PROTECTED_CRITICISM_TERMS,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "add") {
    const result = await addFilterWord(session.shop, formData.get("word"));
    if (result.error) return { error: result.error, ok: false };
  }

  if (intent === "delete") {
    await deleteFilterWord(session.shop, String(formData.get("id") || ""));
  }

  if (intent === "toggle_rule") {
    const ruleId = String(formData.get("ruleId") || "");
    const enabled = formData.get("enabled") === "true";
    await updateModerationRule(session.shop, ruleId, enabled);
  }

  return { ok: true };
};

export default function Filters() {
  const { builtInRules, filterWords, protectedCriticismTerms } = useLoaderData();
  const fetcher = useFetcher();
  const [localRules, setLocalRules] = useState(builtInRules);

  useEffect(() => {
    setLocalRules(builtInRules);
  }, [builtInRules]);

  const activeBuiltInCount = localRules.filter((r) => r.enabled).length;
  const activeFilterWords = filterWords.filter((filterWord) => filterWord.isAllowed);
  const activeRuleCount = activeBuiltInCount + activeFilterWords.length;

  const handleToggle = (ruleId, currentEnabled) => {
    const nextEnabled = !currentEnabled;
    setLocalRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, enabled: nextEnabled } : r))
    );
    fetcher.submit(
      {
        intent: "toggle_rule",
        ruleId,
        enabled: nextEnabled ? "true" : "false",
      },
      { method: "post" }
    );
  };

  return (
    <s-page heading="Content Moderation" inlineSize="large">
      <div className={styles.filtersLayout}>
        <main className={styles.filtersMain}>
          <s-section heading="Content moderation">
            <div className={styles.hero}>
              <div className={styles.heroCopy}>
                <p className={styles.eyebrow}>Automatic moderation</p>
                <h2>Keep every review trustworthy</h2>
                <p>
                  Detect spam, profanity, personal information, and inappropriate
                  content before submission. Customers must remove matched content
                  before their review can be published.
                </p>
              </div>
              <div className={styles.ruleCount}>
                <strong>{activeRuleCount}</strong>
                <span>Active {activeRuleCount === 1 ? "rule" : "rules"}</span>
              </div>
            </div>

            <div className={styles.addPanel}>
              <div className={styles.panelHeading}>
                <div className={styles.panelIcon}>+</div>
                <div>
                  <h3>Add a moderation term</h3>
                  <p>Add only profanity, slurs, spam markers, or unsafe content terms.</p>
                </div>
              </div>
              <fetcher.Form className={styles.addForm} method="post">
                <input type="hidden" name="intent" value="add" />
                <label>
                  <span className={styles.visuallyHidden}>Moderation term</span>
                  <input
                    name="word"
                    placeholder="For example: a spam domain or abusive term"
                    maxLength={80}
                    required
                  />
                </label>
                <s-button type="submit" variant="primary">
                  Add term
                </s-button>
              </fetcher.Form>
              {fetcher.data?.error ? (
                <s-banner tone="critical">{fetcher.data.error}</s-banner>
              ) : null}
            </div>

            <div className={styles.rulesPanel}>
              <div className={styles.rulesHeader}>
                <div>
                  <p className={styles.eyebrow}>Backend protection</p>
                  <h3>Automatic checks</h3>
                </div>
                <span>{activeBuiltInCount} of {localRules.length} active</span>
              </div>
              <div className={styles.wordList}>
                {localRules.map((rule) => (
                  <article
                    className={`${styles.wordCard} ${rule.enabled ? styles.wordCardActive : styles.wordCardDisabled}`}
                    key={rule.id}
                  >
                    <div className={styles.wordIdentity}>
                      <span
                        className={`${styles.wordIcon} ${rule.enabled ? styles.activeWordIcon : styles.inactiveWordIcon}`}
                      >
                        {rule.enabled ? "✓" : "✕"}
                      </span>
                      <div>
                        <small className={rule.enabled ? styles.statusActive : styles.statusDisabled}>
                          {rule.enabled ? "Active check" : "Disabled"}
                        </small>
                        <strong>{rule.label}</strong>
                        <p>{rule.description}</p>
                      </div>
                    </div>
                    <div className={styles.switchWrapper}>
                      <label className={styles.switchLabel} aria-label={`Toggle ${rule.label}`}>
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => handleToggle(rule.id, rule.enabled)}
                        />
                        <span className={styles.slider} />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            </div>

        {filterWords.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>✓</div>
            <div>
              <h3>No moderation terms yet</h3>
              <p>Personal information and suspicious links are still detected automatically.</p>
            </div>
          </div>
        ) : (
          <div className={styles.rulesPanel}>
            <div className={styles.rulesHeader}>
              <div>
                <p className={styles.eyebrow}>Moderation list</p>
                <h3>Moderation terms</h3>
              </div>
              <span>{filterWords.length} total</span>
            </div>
            <div className={styles.wordList}>
              {filterWords.map((filterWord) => (
                <article className={styles.wordCard} key={filterWord.id}>
                  <div className={styles.wordIdentity}>
                    <span className={styles.wordIcon}>#</span>
                    <div>
                      <small>{filterWord.isAllowed ? "Content safety rule" : "Inactive criticism term"}</small>
                      <strong>{filterWord.word}</strong>
                    </div>
                  </div>
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={filterWord.id} />
                    <s-button type="submit" tone="critical" variant="secondary">
                      Remove
                    </s-button>
                  </fetcher.Form>
                </article>
              ))}
            </div>
          </div>
        )}

            <s-banner tone="info">
              Legitimate criticism is protected. These terms cannot be used as
              moderation filters: {protectedCriticismTerms.join(", ")}.
            </s-banner>
          </s-section>
        </main>

        <aside className={styles.filtersAside}>
          <s-section heading="How it works">
            <div className={styles.sideNote}>
              <div className={styles.sideNoteHeader}>
                <span>Smart workflow</span>
                <h3>Review with confidence</h3>
                <p>A simple safeguard between submission and publication.</p>
              </div>
              <ol>
                <li>
                  <span>1</span>
                  <div><strong>Set safety terms</strong><p>Use only objective spam, abuse, or privacy signals.</p></div>
                </li>
                <li>
                  <span>2</span>
                  <div><strong>Unsafe content is blocked</strong><p>The customer sees the reason and can edit their review.</p></div>
                </li>
                <li>
                  <span>3</span>
                  <div><strong>Normal reviews publish</strong><p>Legitimate feedback appears automatically.</p></div>
                </li>
              </ol>
              <div className={styles.sideStatus}>
                <span
                  className={styles.statusDot}
                  style={
                    activeBuiltInCount > 0
                      ? {}
                      : { background: "#94a3b8", boxShadow: "0 0 0 4px rgba(148, 163, 184, 0.15)" }
                  }
                />
                {activeBuiltInCount > 0
                  ? "Automatic moderation is active"
                  : "Automatic checks are paused"}
              </div>
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
