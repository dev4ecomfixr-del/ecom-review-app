CREATE TABLE "GeneratedCoupon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "reviewId" TEXT,
    "shopifyDiscountId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "percentage" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deletionError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "GeneratedCoupon_shop_code_key"
ON "GeneratedCoupon"("shop", "code");

CREATE UNIQUE INDEX "GeneratedCoupon_shop_shopifyDiscountId_key"
ON "GeneratedCoupon"("shop", "shopifyDiscountId");

CREATE INDEX "GeneratedCoupon_shop_status_idx"
ON "GeneratedCoupon"("shop", "status");

CREATE INDEX "GeneratedCoupon_shop_expiresAt_idx"
ON "GeneratedCoupon"("shop", "expiresAt");
