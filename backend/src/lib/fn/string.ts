import path from "path";
const RE2Class: typeof RegExp = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("re2");
  } catch {
    return RegExp;
  }
})();

// given two paths irrespective of ending with / or not
// this will return true if its equal
export const isSamePath = (from: string, to: string) => !path.relative(from, to);

export const removeTrailingSlash = (str: string) => {
  if (!str) return str;
  if (/^\/+$/.test(str)) return "/";

  return str.replace(/\/+$/, "");
};

export const prefixWithSlash = (str: string) => {
  if (str.startsWith("/")) return str;
  return `/${str}`;
};

const vowelRegex = new RE2Class(/^[aeiou]/i);

export const startsWithVowel = (str: string) => vowelRegex.test(str);

const pickWordsRegex = new RE2Class(/(\W+)/);
export const sanitizeString = (dto: { unsanitizedString: string; tokens: string[] }) => {
  const words = dto.unsanitizedString.split(pickWordsRegex);

  const redactionSet = new Set(dto.tokens.filter(Boolean));
  const sanitizedWords = words.map((el) => {
    if (redactionSet.has(el)) {
      return "[REDACTED]";
    }
    return el;
  });
  return sanitizedWords.join("");
};

export const sanitizeSqlLikeString = (value: string): string => {
  return String(value).replace(new RE2Class("[%_\\\\]", "g"), "\\$&");
};

