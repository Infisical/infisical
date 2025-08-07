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

const vowelRegex = new RE2(/^[aeiou]/i);

export const startsWithVowel = (str: string) => vowelRegex.test(str);

export const sanitizeString = (dto: { unsanitizedString: string; tokens: string[] }) => {
  let sanitizedString = dto.unsanitizedString;
  dto.tokens.filter(Boolean).forEach((el) => {
    sanitizedString = sanitizedString.replaceAll(el, "[REDACTED]");
  });
  return sanitizedString;
};
