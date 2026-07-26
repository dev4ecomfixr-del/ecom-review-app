-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT,
    "productHandle" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Review_shop_idx" ON "Review"("shop");

-- CreateIndex
CREATE INDEX "Review_shop_productId_idx" ON "Review"("shop", "productId");

-- CreateIndex
CREATE INDEX "Review_shop_productHandle_idx" ON "Review"("shop", "productHandle");

-- CreateIndex
CREATE INDEX "Review_shop_status_idx" ON "Review"("shop", "status");
