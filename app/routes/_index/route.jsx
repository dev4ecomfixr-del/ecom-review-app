import { useEffect } from "react";
import { redirect } from "react-router";
import styles from "./styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  if (
    url.searchParams.get("shop") ||
    url.searchParams.get("host") ||
    url.searchParams.get("embedded") ||
    url.searchParams.get("id_token")
  ) {
    return redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function App() {
  useEffect(() => {
    // If loaded inside Shopify Admin iframe, redirect directly to dashboard
    if (typeof window !== "undefined" && window.top !== window.self) {
      window.location.replace(`/app${window.location.search}`);
    }
  }, []);

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <div className={styles.brand}>
          <h1 className={styles.heading}>ReviewLift</h1>
          <p className={styles.text}>
            Modern customer review widgets and photo/video reviews for your Shopify store.
          </p>
          <a
            className={styles.ctaButton}
            href="https://apps.shopify.com"
            rel="noopener noreferrer"
            target="_blank"
          >
            Install from Shopify App Store
          </a>
        </div>
        <ul className={styles.list}>
          <li>
            <strong>Storefront Reviews</strong>
            <p>Showcase customer ratings, reviews, photos, and videos in customizable carousels.</p>
          </li>
          <li>
            <strong>Review Rewards</strong>
            <p>Motivate customers to share feedback with automatic discount coupons.</p>
          </li>
          <li>
            <strong>Theme App Blocks</strong>
            <p>Seamlessly integrate review widgets without touching theme code.</p>
          </li>
        </ul>
      </div>
    </div>
  );
}
