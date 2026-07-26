import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  addFilterWord,
  deleteFilterWord,
  getFilterWords,
} from "../lib/filter-words.server";
import styles from "../styles/filters.module.css";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const filterWords = await getFilterWords(session.shop);

  return { filterWords };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "add") {
    await addFilterWord(session.shop, formData.get("word"));
  }

  if (intent === "delete") {
    await deleteFilterWord(session.shop, String(formData.get("id") || ""));
  }

  return { ok: true };
};

export default function Filters() {
  const { filterWords } = useLoaderData();
  const fetcher = useFetcher();

  return (
    <s-page heading="Review filters" inlineSize="large">
      <div className={styles.filtersLayout}>
        <main className={styles.filtersMain}>
          <s-section heading="Approval words">
            <div className={styles.hero}>
              <div className={styles.heroCopy}>
                <p className={styles.eyebrow}>Automatic moderation</p>
                <h2>Keep every review trustworthy</h2>
                <p>
                  Flag sensitive words before reviews reach your storefront.
                  Matched submissions move to pending so you stay in control.
                </p>
              </div>
              <div className={styles.ruleCount}>
                <strong>{filterWords.length}</strong>
                <span>Active {filterWords.length === 1 ? "rule" : "rules"}</span>
              </div>
            </div>

            <div className={styles.addPanel}>
              <div className={styles.panelHeading}>
                <div className={styles.panelIcon}>+</div>
                <div>
                  <h3>Add a filter word</h3>
                  <p>Reviews containing this word will require approval.</p>
                </div>
              </div>
              <fetcher.Form className={styles.addForm} method="post">
                <input type="hidden" name="intent" value="add" />
                <label>
                  <span className={styles.visuallyHidden}>Filter word</span>
                  <input
                    name="word"
                    placeholder="Type a word, for example: refund"
                    maxLength={80}
                    required
                  />
                </label>
                <s-button type="submit" variant="primary">
                  Add filter
                </s-button>
              </fetcher.Form>
            </div>

        {filterWords.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>✓</div>
            <div>
              <h3>No filter words yet</h3>
              <p>Add your first word to start automatic moderation.</p>
            </div>
          </div>
        ) : (
          <div className={styles.rulesPanel}>
            <div className={styles.rulesHeader}>
              <div>
                <p className={styles.eyebrow}>Moderation list</p>
                <h3>Active filter words</h3>
              </div>
              <span>{filterWords.length} total</span>
            </div>
            <div className={styles.wordList}>
              {filterWords.map((filterWord) => (
                <article className={styles.wordCard} key={filterWord.id}>
                  <div className={styles.wordIdentity}>
                    <span className={styles.wordIcon}>#</span>
                    <div>
                      <small>Approval required</small>
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
                  <div><strong>Add filter words</strong><p>Choose terms that need a manual check.</p></div>
                </li>
                <li>
                  <span>2</span>
                  <div><strong>Reviews are flagged</strong><p>Matches are held safely as pending.</p></div>
                </li>
                <li>
                  <span>3</span>
                  <div><strong>Approve and publish</strong><p>Release trusted reviews from the dashboard.</p></div>
                </li>
              </ol>
              <div className={styles.sideStatus}>
                <span className={styles.statusDot} />
                Automatic moderation is active
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
