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

let isModerationTableEnsured = false;
async function ensureModerationSettingTable() {
  if (isModerationTableEnsured) return;
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ModerationSetting (
        shop TEXT PRIMARY KEY,
        blockEmail INTEGER NOT NULL DEFAULT 1,
        blockPhone INTEGER NOT NULL DEFAULT 1,
        blockLinks INTEGER NOT NULL DEFAULT 1,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    isModerationTableEnsured = true;
  } catch (e) {
    // ignore
  }
}

export const getModerationSettings = async (shop) => {
  await ensureModerationSettingTable();
  try {
    if (db.moderationSetting) {
      const setting = await db.moderationSetting.findUnique({ where: { shop } });
      if (setting) {
        return {
          EMAIL_ADDRESS: Boolean(setting.blockEmail),
          PHONE_NUMBER: Boolean(setting.blockPhone),
          SUSPICIOUS_LINK: Boolean(setting.blockLinks),
        };
      }
    } else {
      const rows = await db.$queryRaw`
        SELECT blockEmail, blockPhone, blockLinks FROM ModerationSetting WHERE shop = ${shop} LIMIT 1
      `;
      if (rows && rows.length > 0) {
        return {
          EMAIL_ADDRESS: Boolean(rows[0].blockEmail),
          PHONE_NUMBER: Boolean(rows[0].blockPhone),
          SUSPICIOUS_LINK: Boolean(rows[0].blockLinks),
        };
      }
    }
  } catch (err) {
    console.error("Error getting moderation settings:", err);
  }
  return {
    EMAIL_ADDRESS: true,
    PHONE_NUMBER: true,
    SUSPICIOUS_LINK: true,
  };
};

export const updateModerationRule = async (shop, ruleId, enabled) => {
  await ensureModerationSettingTable();
  const current = await getModerationSettings(shop);
  const updated = {
    ...current,
    [ruleId]: Boolean(enabled),
  };

  const blockEmail = updated.EMAIL_ADDRESS ? 1 : 0;
  const blockPhone = updated.PHONE_NUMBER ? 1 : 0;
  const blockLinks = updated.SUSPICIOUS_LINK ? 1 : 0;

  try {
    if (db.moderationSetting) {
      await db.moderationSetting.upsert({
        where: { shop },
        create: {
          shop,
          blockEmail: Boolean(blockEmail),
          blockPhone: Boolean(blockPhone),
          blockLinks: Boolean(blockLinks),
        },
        update: {
          blockEmail: Boolean(blockEmail),
          blockPhone: Boolean(blockPhone),
          blockLinks: Boolean(blockLinks),
        },
      });
    } else {
      await db.$executeRaw`
        INSERT INTO ModerationSetting (shop, blockEmail, blockPhone, blockLinks, createdAt, updatedAt)
        VALUES (${shop}, ${blockEmail}, ${blockPhone}, ${blockLinks}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(shop) DO UPDATE SET
          blockEmail = ${blockEmail},
          blockPhone = ${blockPhone},
          blockLinks = ${blockLinks},
          updatedAt = CURRENT_TIMESTAMP
      `;
    }
  } catch (err) {
    console.error("Error updating moderation setting:", err);
  }

  return updated;
};

export const detectModerationReason = async (shop, values) => {
  const content = values.filter(Boolean).join(" ");
  const matchedFilterWord = await findMatchedFilterWord(shop, values);

  if (matchedFilterWord) return "CUSTOM_MODERATION_TERM";

  const settings = await getModerationSettings(shop);

  if (settings.EMAIL_ADDRESS && /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(content)) {
    return "EMAIL_ADDRESS";
  }
  if (settings.PHONE_NUMBER && /(?:\+?\d[\s().-]*){8,}/.test(content)) {
    return "PHONE_NUMBER";
  }
  if (settings.SUSPICIOUS_LINK && /\b(?:https?:\/\/|www\.)\S+/i.test(content)) {
    return "SUSPICIOUS_LINK";
  }

  return null;
};
