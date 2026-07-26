import db from "../db.server";

const esc = (str) =>
  String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const buildReviewPageHTML = ({ shop, name, email, productHandle, productId, productTitle }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Leave a Review</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f6f8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#fff;border-radius:14px;padding:36px 32px;max-width:520px;width:100%;box-shadow:0 4px 32px rgba(0,0,0,.10)}
h1{font-size:22px;font-weight:700;color:#111;margin-bottom:6px}
.sub{color:#666;font-size:14px;margin-bottom:22px}
.product-tag{display:inline-flex;align-items:center;gap:6px;background:#f0fbf5;border:1px solid #b3e4ca;border-radius:20px;padding:5px 14px;font-size:13px;color:#1a6e43;font-weight:600;margin-bottom:22px}
.stars-row{display:flex;gap:6px;margin-bottom:6px}
.star{font-size:38px;cursor:pointer;color:#ddd;transition:color .1s;user-select:none;line-height:1}
.star.lit{color:#f5aa12}
.rating-hint{font-size:13px;color:#888;margin-bottom:20px;min-height:18px}
.field{margin-bottom:14px}
label{display:block;font-size:13px;font-weight:600;color:#444;margin-bottom:5px}
input,textarea{width:100%;padding:10px 13px;border:1px solid #ddd;border-radius:8px;font:inherit;font-size:14px;color:#111;transition:border .15s}
input:focus,textarea:focus{outline:none;border-color:#0f7b5d}
textarea{min-height:120px;resize:vertical;line-height:1.5}
.file-input{padding:10px;background:#fbfdfc}
.help{font-size:12px;color:#777;margin-top:5px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.btn{width:100%;padding:13px;background:#111;color:#fff;border:none;border-radius:9px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;margin-top:6px;transition:background .15s}
.btn:hover{background:#333}
.btn:disabled{background:#aaa;cursor:not-allowed}
.err{color:#b42318;font-size:13px;margin-top:10px;padding:10px 13px;background:#fff0ee;border-radius:8px}
.success{text-align:center;padding:24px 0}
.success .icon{font-size:52px;margin-bottom:16px}
.success h2{font-size:22px;color:#111;margin-bottom:8px}
.success p{color:#666;font-size:15px}
@media(max-width:480px){.row{grid-template-columns:1fr}.card{padding:24px 18px}}
</style>
</head>
<body>
<div class="card" id="form-wrap">
  <h1>Leave a Review</h1>
  <p class="sub">Share your experience with your recent purchase</p>
  ${productTitle ? `<div class="product-tag">📦 ${esc(productTitle)}</div>` : ""}
  <div class="stars-row" id="stars">
    <span class="star" data-v="1">★</span>
    <span class="star" data-v="2">★</span>
    <span class="star" data-v="3">★</span>
    <span class="star" data-v="4">★</span>
    <span class="star" data-v="5">★</span>
  </div>
  <p class="rating-hint" id="hint">Click to rate</p>
  <form id="rf">
    <input type="hidden" name="rating" id="rval" value="0">
    <input type="hidden" name="shop" value="${esc(shop)}">
    ${productHandle ? `<input type="hidden" name="productHandle" value="${esc(productHandle)}">` : ""}
    ${productId && !productHandle ? `<input type="hidden" name="productId" value="${esc(productId)}">` : ""}
    ${productTitle ? `<input type="hidden" name="productTitle" value="${esc(productTitle)}">` : ""}
    <div class="row">
      <div class="field"><label>Your name *</label><input name="customerName" value="${esc(name)}" required maxlength="120" placeholder="Jane Smith"></div>
      <div class="field"><label>Email (optional)</label><input type="email" name="customerEmail" value="${esc(email)}" maxlength="255" placeholder="jane@example.com"></div>
    </div>
    <div class="field"><label>Review title</label><input name="title" maxlength="120" placeholder="Summarise your experience"></div>
    <div class="field"><label>Your review *</label><textarea name="body" required maxlength="1000" placeholder="What did you like or dislike?"></textarea></div>
    <div class="field">
      <label>Add photos or videos</label>
      <input class="file-input" name="photos" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm" multiple>
      <p class="help">Max 5 files. JPG, PNG, WebP, MP4, MOV, or WebM.</p>
    </div>
    <div id="err-box"></div>
    <button class="btn" type="submit" id="sbtn">Submit review</button>
  </form>
</div>
<div class="card success" id="success-wrap" style="display:none">
  <div class="icon">✅</div>
  <h2>Thank you!</h2>
  <p>Your review has been submitted and is now under review.</p>
</div>
<script>
(function(){
  var hints=['','Poor','Fair','Good','Very good','Excellent'];
  var sel=0;
  var starsEl=document.getElementById('stars');
  var hintEl=document.getElementById('hint');
  var rvalEl=document.getElementById('rval');
  starsEl.querySelectorAll('.star').forEach(function(s){
    s.addEventListener('mouseover',function(){paint(+this.dataset.v);});
    s.addEventListener('click',function(){sel=+this.dataset.v;rvalEl.value=sel;hintEl.textContent=hints[sel];paint(sel);});
  });
  starsEl.addEventListener('mouseleave',function(){paint(sel);});
  function paint(n){starsEl.querySelectorAll('.star').forEach(function(s){s.className='star'+(+s.dataset.v<=n?' lit':'');});}
  document.getElementById('rf').addEventListener('submit',async function(e){
    e.preventDefault();
    var errBox=document.getElementById('err-box');
    errBox.innerHTML='';
    if(sel===0){errBox.innerHTML='<p class="err">Please select a star rating.</p>';return;}
    var btn=document.getElementById('sbtn');
    btn.disabled=true;btn.textContent='Submitting…';
    try{
      var fd=new FormData(this);
      var res=await fetch('/apps/reviews',{method:'POST',body:fd});
      var data=await res.json();
      if(!res.ok||data.error){errBox.innerHTML='<p class="err">'+(data.error||'Something went wrong. Please try again.')+'</p>';btn.disabled=false;btn.textContent='Submit review';return;}
      document.getElementById('form-wrap').style.display='none';
      document.getElementById('success-wrap').style.display='block';
    }catch(err){errBox.innerHTML='<p class="err">Could not submit. Please try again.</p>';btn.disabled=false;btn.textContent='Submit review';}
  });
})();
</script>
</body>
</html>`;
import { findMatchedFilterWord } from "../lib/filter-words.server";
import {
  DEFAULT_PLAN,
  PLAN_CODES,
  getPlanByCode,
  isPlanAtLeast,
} from "../lib/plans";
import { getShopPlanCode } from "../lib/shop-plans.server";
import {
  getReviewRewardSettings,
} from "../lib/app-feature-metafields.server";
import {
  cleanupExpiredReviewCoupons,
  createUniqueReviewDiscount,
} from "../lib/review-reward-discounts.server";
import {
  getReviewPhotoFiles,
  getValidReviewPhotos,
  uploadReviewPhotosToShopify,
} from "../lib/shopify-files.server";
import { unauthenticated } from "../shopify.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, max-age=0",
};

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...init.headers,
    },
  });

const cleanText = (value, maxLength) =>
  String(value || "")
    .trim()
    .slice(0, maxLength);

const normalizeRating = (value) => {
  const rating = Number.parseInt(value, 10);
  if (Number.isNaN(rating)) return null;
  return Math.min(5, Math.max(1, rating));
};

const isVideoUrl = (url) =>
  /\.(?:mp4|mov|webm|m3u8)(?:\?|#|$)/i.test(String(url || ""));

const normalizeReviewMediaTypes = (reviews) =>
  reviews.map((review) => ({
    ...review,
    photos: review.photos.map((photo) => ({
      ...photo,
      mediaType:
        photo.mediaType === "VIDEO" || isVideoUrl(photo.url)
          ? "VIDEO"
          : "IMAGE",
    })),
  }));

const hydrateMissingPhotoUrls = async (shop, reviews) => {
  const missingPhotos = reviews.flatMap((review) =>
    review.photos.filter((photo) => photo.shopifyFileId && !photo.url),
  );

  if (!missingPhotos.length) {
    return reviews;
  }

  const { admin } = await unauthenticated.admin(shop);
  const refreshedFiles = await getReviewPhotoFiles(
    admin,
    missingPhotos.map((photo) => photo.shopifyFileId),
  );
  const urlByFileId = new Map(
    refreshedFiles
      .map((file) => [file.id, file.image?.url || file.sources?.[0]?.url || file.url])
      .filter(([, url]) => url),
  );

  await Promise.all(
    missingPhotos.map((photo) => {
      const url = urlByFileId.get(photo.shopifyFileId);

      if (!url) return null;

      photo.url = url;

      return db.reviewPhoto.update({
        where: { id: photo.id },
        data: { url },
      });
    }),
  );

  return reviews;
};

export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const shop = cleanText(url.searchParams.get("shop"), 255);
  const productId = cleanText(url.searchParams.get("productId"), 255);
  const productHandle = cleanText(url.searchParams.get("product") || url.searchParams.get("productHandle"), 255);
  const summaryOnly = url.searchParams.get("summary") === "true";

  if (url.searchParams.get("page") === "1") {
    return new Response(
      buildReviewPageHTML({
        shop,
        name: cleanText(url.searchParams.get("name"), 120),
        email: cleanText(url.searchParams.get("email"), 255),
        productHandle,
        productId,
        productTitle: cleanText(url.searchParams.get("productTitle"), 120),
      }),
      { headers: { "Content-Type": "text/html", ...corsHeaders } },
    );
  }

  if (!shop) {
    return json({ reviews: [] });
  }

  const productFilter =
    productId || productHandle
      ? {
          OR: [
            productId ? { productId } : undefined,
            productHandle ? { productHandle } : undefined,
          ].filter(Boolean),
        }
      : {};

  const where = {
    shop,
    status: "PUBLISHED",
    ...productFilter,
  };

  if (summaryOnly) {
    const [shopPlan, reviewCount, averageRating] = await Promise.all([
      getShopPlanCode(shop),
      db.review.count({ where }),
      db.review.aggregate({
        where,
        _avg: { rating: true },
      }),
    ]);
    const plan = getPlanByCode(shopPlan || DEFAULT_PLAN.code);
    const paidWidgetsAvailable = isPlanAtLeast(plan.code, PLAN_CODES.GROWTH);

    return json({
      plan: {
        code: plan.code,
        name: plan.name,
      },
      summary: {
        averageRating: averageRating._avg.rating || 0,
        reviewCount,
      },
      features: {
        reviewVibe: paidWidgetsAvailable,
        starBadge: paidWidgetsAvailable,
        videoReviews: paidWidgetsAvailable,
      },
    });
  }

  const reviews = await db.review.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      customerName: true,
      rating: true,
      title: true,
      productTitle: true,
      productHandle: true,
      body: true,
      merchantReply: true,
      repliedAt: true,
      createdAt: true,
      photos: {
        select: {
          alt: true,
          id: true,
          shopifyFileId: true,
          mediaType: true,
          url: true,
        },
      },
    },
  });

  const hydratedReviews = await hydrateMissingPhotoUrls(shop, reviews);

  return json({ reviews: normalizeReviewMediaTypes(hydratedReviews) });
};

export const action = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const contentType = request.headers.get("content-type") || "";
  const formData = contentType.includes("application/json")
    ? null
    : await request.formData();
  const payload = contentType.includes("application/json")
    ? await request.json()
    : Object.fromEntries(formData);
  const photoFiles = formData ? getValidReviewPhotos(formData.getAll("photos")) : [];

  const shop = cleanText(payload.shop, 255);
  const customerName = cleanText(payload.customerName, 120);
  const customerEmail = cleanText(payload.customerEmail, 255);
  const title = cleanText(payload.title, 120);
  const body = cleanText(payload.body, 1000);
  const productId = cleanText(payload.productId, 255);
  const productHandle = cleanText(payload.productHandle, 255);
  const productTitle = cleanText(payload.productTitle, 255);
  const rating = normalizeRating(payload.rating);

  if (!shop || !customerName || !body || !rating) {
    return json(
      { error: "Name, rating, review, and shop are required." },
      { status: 400 },
    );
  }

  const [shopPlan, reviewCount] = await Promise.all([
    getShopPlanCode(shop),
    db.review.count({ where: { shop } }),
  ]);
  const plan = getPlanByCode(shopPlan || DEFAULT_PLAN.code);

  if (plan.reviewLimit !== null && reviewCount >= plan.reviewLimit) {
    return json(
      {
        error: `${plan.name} plan limit reached. Upgrade to collect more reviews.`,
      },
      { status: 403 },
    );
  }

  const matchedFilterWord = await findMatchedFilterWord(shop, [title, body]);
  const status = matchedFilterWord ? "PENDING" : "PUBLISHED";
  let uploadedPhotos = [];

  try {
    uploadedPhotos = await uploadReviewPhotosToShopify({
      alt: title || `Review photo from ${customerName}`,
      files: photoFiles,
      shop,
    });
  } catch (error) {
    return json(
      {
        error:
          error.message ||
          "Could not upload review photos. Please try again without photos.",
      },
      { status: 400 },
    );
  }

  const review = await db.review.create({
    data: {
      shop,
      customerName,
      customerEmail: customerEmail || null,
      productId: productId || null,
      productHandle: productHandle || null,
      productTitle: productTitle || null,
      rating,
      title: title || null,
      body,
      status,
      photos: {
        create: uploadedPhotos.map((photo) => ({
          alt: photo.alt,
          mediaType: photo.mediaType,
          shop,
          shopifyFileId: photo.shopifyFileId,
          url: photo.url,
        })),
      },
    },
    select: {
      id: true,
      customerName: true,
      rating: true,
      title: true,
      productTitle: true,
      productHandle: true,
      body: true,
      createdAt: true,
      photos: {
        select: {
          alt: true,
          id: true,
          mediaType: true,
          url: true,
        },
      },
    },
  });

  let reviewReward = null;
  let reviewRewardError = null;
  try {
    const { admin } = await unauthenticated.admin(shop);
    cleanupExpiredReviewCoupons(admin, shop).catch((error) => {
      console.error("Could not clean up expired review coupons", error);
    });
    const rewardSettings = await getReviewRewardSettings(admin);
    if (rewardSettings.enabled) {
      let discountCode = rewardSettings.discountCode || "";
      if (rewardSettings.generateUniqueCode) {
        try {
          const generatedCoupon = await createUniqueReviewDiscount(
            admin,
            rewardSettings,
          );
          discountCode = generatedCoupon.code;
          try {
            await db.generatedCoupon.create({
              data: {
                code: generatedCoupon.code,
                expiresAt: generatedCoupon.expiresAt,
                percentage: generatedCoupon.percentage,
                reviewId: review.id,
                shop,
                shopifyDiscountId: generatedCoupon.shopifyDiscountId,
              },
            });
          } catch (error) {
            console.error("Could not record generated review coupon", error);
          }
        } catch (error) {
          console.error("Could not create unique review discount", error);
          reviewRewardError =
            "The review was submitted, but Shopify could not generate the coupon. Reauthorize the app with discount permissions.";
        }
      }
      reviewReward = { ...rewardSettings, discountCode };
    }
  } catch (error) {
    console.error("Could not load review reward settings", error);
    reviewRewardError =
      "The review was submitted, but the coupon settings could not be loaded.";
  }

  return json({ review, reviewReward, reviewRewardError }, { status: 201 });
};
