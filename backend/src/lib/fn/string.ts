import path from "path";

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

export const startsWithVowel = (str: string) => /^[aeiou]/i.test(str);

export const wrapWithSlashes = (str: string) => {
  return `${str.startsWith("/") ? "" : "/"}${str}${str.endsWith("/") ? "" : `/`}`;
};
