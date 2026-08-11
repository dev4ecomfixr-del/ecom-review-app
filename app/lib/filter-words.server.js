import { randomUUID } from "node:crypto";
import db from "../db.server.js";

const normalizeWord = (word) =>
  String(word || "")
    .trim()
    .toLowerCase()
    .slice(0, 80);

const CRITICISM_TERMS = new Set([
  "awful",
  "bad",
  "broken",
  "cheap",
  "disappointed",
  "disappointing",
  "expensive",
  "late",
  "poor",
  "refund",
  "scam",
  "slow",
  "terrible",
  "waste",
  "worst",
]);

export const BUILT_IN_MODERATION_RULES = [
  {
    id: "EMAIL_ADDRESS",
    label: "Email addresses",
    description: "Blocks email addresses included in the review title or comment.",
  },
  {
    id: "PHONE_NUMBER",
    label: "Phone numbers",
    description: "Blocks phone numbers containing eight or more digits.",
  },
  {
    id: "SUSPICIOUS_LINK",
    label: "Suspicious links",
    description: "Blocks web links beginning with http, https, or www.",
  },
];

export const PROTECTED_CRITICISM_TERMS = Array.from(CRITICISM_TERMS);

export const validateModerationTerm = (word) => {
  const normalizedWord = normalizeWord(word);

  if (!normalizedWord) {
    return { error: "Enter a moderation term.", word: normalizedWord };
  }

  const includesCriticism = normalizedWord
    .split(/[^a-z0-9]+/)
    .some((term) => CRITICISM_TERMS.has(term));

  if (includesCriticism) {
    return {
      error:
        "This term may suppress legitimate criticism. Add only profanity, slurs, spam markers, or unsafe content patterns.",
      word: normalizedWord,
    };
  }

  return { error: null, word: normalizedWord };
};

export const getFilterWords = async (shop) => {
  if (db.filterWord) {
    return db.filterWord.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
    });
  }

  return db.$queryRaw`
    SELECT id, shop, word, createdAt
    FROM FilterWord
    WHERE shop = ${shop}
    ORDER BY createdAt DESC
  `;
};

export const addFilterWord = async (shop, word) => {
  const { error, word: normalizedWord } = validateModerationTerm(word);

  if (error) {
    return { error };
  }

  if (db.filterWord) {
    const filterWord = await db.filterWord.upsert({
      where: { shop_word: { shop, word: normalizedWord } },
      create: { shop, word: normalizedWord },
      update: {},
    });
    return { error: null, filterWord };
  }

  await db.$executeRaw`
    INSERT OR IGNORE INTO FilterWord (id, shop, word, createdAt)
    VALUES (${randomUUID()}, ${shop}, ${normalizedWord}, CURRENT_TIMESTAMP)
  `;

  return { error: null, filterWord: { shop, word: normalizedWord } };
};

export const deleteFilterWord = async (shop, id) => {
  if (!id) {
    return;
  }

  if (db.filterWord) {
    await db.filterWord.deleteMany({ where: { id, shop } });
    return;
  }

  await db.$executeRaw`
    DELETE FROM FilterWord WHERE id = ${id} AND shop = ${shop}
  `;
};

export const findMatchedFilterWord = async (shop, values) => {
  const filterWords = await getFilterWords(shop);
  const searchable = values
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    filterWords.find(({ word }) => {
      const validation = validateModerationTerm(word);
      if (validation.error) return false;
      if (/^[a-z0-9 ]+$/.test(word)) {
        const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(^|[^a-z0-9])${escapedWord}([^a-z0-9]|$)`).test(searchable);
      }
      return searchable.includes(word);
    }) || null
  );
};

export const detectModerationReason = async (shop, values) => {
  const content = values.filter(Boolean).join(" ");
  const matchedFilterWord = await findMatchedFilterWord(shop, values);

  if (matchedFilterWord) return "CUSTOM_MODERATION_TERM";
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(content)) {
    return "EMAIL_ADDRESS";
  }
  if (/(?:\+?\d[\s().-]*){8,}/.test(content)) {
    return "PHONE_NUMBER";
  }
  if (/\b(?:https?:\/\/|www\.)\S+/i.test(content)) {
    return "SUSPICIOUS_LINK";
  }

  return null;
};
