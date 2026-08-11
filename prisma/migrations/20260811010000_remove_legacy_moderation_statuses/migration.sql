UPDATE "Review"
SET "status" = 'PUBLISHED',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('PENDING', 'HIDDEN');
