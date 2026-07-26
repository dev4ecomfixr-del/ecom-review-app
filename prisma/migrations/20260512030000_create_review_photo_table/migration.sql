-- CreateTable
CREATE TABLE "ReviewPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyFileId" TEXT,
    "url" TEXT,
    "alt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewPhoto_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ReviewPhoto_reviewId_idx" ON "ReviewPhoto"("reviewId");

-- CreateIndex
CREATE INDEX "ReviewPhoto_shop_idx" ON "ReviewPhoto"("shop");
