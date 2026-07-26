-- CreateTable
CREATE TABLE "EmailNotificationSetting" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "subject" TEXT NOT NULL DEFAULT 'How was your recent order?',
    "body" TEXT NOT NULL DEFAULT 'Hi {{customer_name}},

Thank you for your order {{order_name}}. We would love to hear what you think about your purchase.

Share your feedback here: {{review_link}}',
    "delayDays" INTEGER NOT NULL DEFAULT 2,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PendingEmailNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderName" TEXT,
    "customerEmail" TEXT NOT NULL,
    "customerName" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sendAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingEmailNotification_shop_orderId_key" ON "PendingEmailNotification"("shop", "orderId");

-- CreateIndex
CREATE INDEX "PendingEmailNotification_shop_idx" ON "PendingEmailNotification"("shop");

-- CreateIndex
CREATE INDEX "PendingEmailNotification_status_sendAt_idx" ON "PendingEmailNotification"("status", "sendAt");
