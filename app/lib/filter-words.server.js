import { randomUUID } from "node:crypto";
import db from "../db.server.js";

const normalizeWord = (word) =>
  String(word || "")
    .trim()
    .toLowerCase()
    .slice(0, 80);

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
  const normalizedWord = normalizeWord(word);

  if (!normalizedWord) {
    return null;
  }

  if (db.filterWord) {
    return db.filterWord.upsert({
      where: { shop_word: { shop, word: normalizedWord } },
      create: { shop, word: normalizedWord },
      update: {},
    });
  }

  await db.$executeRaw`
    INSERT OR IGNORE INTO FilterWord (id, shop, word, createdAt)
    VALUES (${randomUUID()}, ${shop}, ${normalizedWord}, CURRENT_TIMESTAMP)
  `;

  return { shop, word: normalizedWord };
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

  return filterWords.find(({ word }) => searchable.includes(word)) || null;
};
