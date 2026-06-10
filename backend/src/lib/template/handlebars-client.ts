import handlebars from "handlebars";
import RE2 from "re2";

import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";

export function createHandlebarsClient() {
  const hbs = handlebars.create();

  hbs.registerHelper("random", hbsRandom);
  hbs.registerHelper("replace", hbsReplace);
  hbs.registerHelper("truncate", hbsTruncate);
  hbs.registerHelper("uppercase", hbsUppercase);
  hbs.registerHelper("lowercase", hbsLowercase);
  hbs.registerHelper('substr', hbsSubstr);
  hbs.registerHelper("stripPrefix", hbsStripPrefix);

  return hbs;
}

const hbsReplace = (text: string, searchValue: string, replaceValue: string) => {
  // Convert to string if it's not already
  const textStr = String(text || "");
  if (!textStr) {
    return textStr;
  }

  try {
    const re2Pattern = new RE2(searchValue, "g");
    // Replace all occurrences
    return re2Pattern.replace(textStr, replaceValue);
  } catch (error) {
    logger.error(error, "RE2 pattern failed, using original template");
    return textStr;
  }
};

const hbsRandom = (length: number) => {
  if (typeof length !== "number" || length <= 0 || length > 100) {
    return "";
  }
  return alphaNumericNanoId(length);
};

const hbsTruncate = (text: string, length: number) => {
  const textStr = String(text || "");
  if (!textStr) {
    return textStr;
  }

  if (typeof length !== "number" || length <= 0) return textStr;
  return textStr.substring(0, length);
};

const hbsUppercase = (text: string) => {
  const textStr = String(text || "");
  return textStr.toUpperCase();
};

const hbsLowercase = (text: string) => {
  const textStr = String(text || "");
  return textStr.toLowerCase();
};

const hbsSubstr = (text: string, start: number, end?: number) => {
  const endIndex = end && typeof end === 'number' ? end : undefined;
  return text.substring(start, endIndex);
}

const hbsStripPrefix = (text: string, prefix: string) => {
  logger.info({prefix: prefix ?? 'no-prefix', text}, "stripPrefix");
  return text.startsWith(prefix) ? text.substring(prefix.length) : text;
}