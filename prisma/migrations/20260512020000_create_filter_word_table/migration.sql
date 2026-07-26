-- CreateTable
CREATE TABLE "FilterWord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "FilterWord_shop_word_key" ON "FilterWord"("shop", "word");

-- CreateIndex
CREATE INDEX "FilterWord_shop_idx" ON "FilterWord"("shop");
