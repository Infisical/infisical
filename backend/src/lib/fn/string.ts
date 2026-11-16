import path from "path";
import RE2 from "re2";

// given two paths irrespective of ending with / or not
// this will return true if its equal
export const isSamePath = (from: string, to: string) => !path.relative(from, to);

export const removeTrailingSlash = (str: string) => {
  if (str === "/") return str;

  return str.endsWith("/") ? str.slice(0, -1) : str;
};

export const prefixWithSlash = (str: string) => {
  if (str.startsWith("/")) return str;
  return `/${str}`;
};

// Folder lookups skip empty segments, so "prod", "//prod" and "/prod/" all name the "/prod" folder.
export const canonicalizeSecretPath = (secretPath: string) => `/${secretPath.split("/").filter(Boolean).join("/")}`;

// A glob can hold slashes inside a group ("{/a,/b}") and can start with a glob character ("*"), so a pattern only gets
// its repeated and trailing slashes removed, and a leading slash only when it starts with a folder name.
export const canonicalizeSecretPathPattern = (pattern: string) => {
  const collapsed = removeTrailingSlash(pattern.replace(/\/{2,}/g, "/"));
  return /^[\w-]/.test(collapsed) ? `/${collapsed}` : collapsed;
};

const vowelRegex = new RE2(/^[aeiou]/i);

export const startsWithVowel = (str: string) => vowelRegex.test(str);

const pickWordsRegex = new RE2(/(\W+)/);
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
  return String(value).replace(new RE2("[%_\\\\]", "g"), "\\$&");
};
