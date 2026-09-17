-- CreateTable
CREATE TABLE "RewardPointSetting" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pointsPerDollar" INTEGER NOT NULL DEFAULT 1,
    "minSpend" REAL NOT NULL DEFAULT 0,
    "pointUnitName" TEXT NOT NULL DEFAULT 'Points',
    "redemptionTiersJson" TEXT NOT NULL DEFAULT '[{"points":100,"type":"FIXED_AMOUNT","value":5,"label":"$5 off"},{"points":200,"type":"FIXED_AMOUNT","value":10,"label":"$10 off"},{"points":500,"type":"PERCENTAGE","value":25,"label":"25% off"}]',
    "couponLifetimeDays" INTEGER NOT NULL DEFAULT 30,
    "codePrefix" TEXT NOT NULL DEFAULT 'RP-',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CustomerPointAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerName" TEXT,
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "totalPointsEarned" INTEGER NOT NULL DEFAULT 0,
    "totalPointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "totalSpend" REAL NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PointTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "accountId" TEXT,
    "orderId" TEXT,
    "orderName" TEXT,
    "points" INTEGER NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PURCHASE_EARN',
    "description" TEXT NOT NULL,
    "couponCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CustomerPointAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RedeemedPointCoupon" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "shopifyDiscountId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "pointsSpent" INTEGER NOT NULL,
    "discountType" TEXT NOT NULL DEFAULT 'FIXED_AMOUNT',
    "discountValue" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "deletionError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPointAccount_shop_customerEmail_key" ON "CustomerPointAccount"("shop", "customerEmail");

-- CreateIndex
CREATE INDEX "CustomerPointAccount_shop_idx" ON "CustomerPointAccount"("shop");

-- CreateIndex
CREATE INDEX "CustomerPointAccount_shop_pointsBalance_idx" ON "CustomerPointAccount"("shop", "pointsBalance");

-- CreateIndex
CREATE INDEX "PointTransaction_shop_idx" ON "PointTransaction"("shop");

-- CreateIndex
CREATE INDEX "PointTransaction_shop_customerEmail_idx" ON "PointTransaction"("shop", "customerEmail");

-- CreateIndex
CREATE INDEX "PointTransaction_accountId_idx" ON "PointTransaction"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "RedeemedPointCoupon_shop_code_key" ON "RedeemedPointCoupon"("shop", "code");

-- CreateIndex
CREATE UNIQUE INDEX "RedeemedPointCoupon_shop_shopifyDiscountId_key" ON "RedeemedPointCoupon"("shop", "shopifyDiscountId");

-- CreateIndex
CREATE INDEX "RedeemedPointCoupon_shop_status_idx" ON "RedeemedPointCoupon"("shop", "status");

-- CreateIndex
CREATE INDEX "RedeemedPointCoupon_shop_customerEmail_idx" ON "RedeemedPointCoupon"("shop", "customerEmail");

-- CreateIndex
CREATE INDEX "RedeemedPointCoupon_shop_expiresAt_idx" ON "RedeemedPointCoupon"("shop", "expiresAt");
