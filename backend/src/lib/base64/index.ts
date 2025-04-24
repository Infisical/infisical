import RE2 from "re2";

type Base64Options = {
  urlSafe?: boolean;
  padding?: boolean;
};

const base64WithPadding = new RE2(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/);
const base64WithoutPadding = new RE2(/^[A-Za-z0-9+/]+$/);
const base64UrlWithPadding = new RE2(
  /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2}==|[A-Za-z0-9_-]{3}=|[A-Za-z0-9_-]{4})$/
);
const base64UrlWithoutPadding = new RE2(/^[A-Za-z0-9_-]+$/);

export const isBase64 = (str: string, options: Base64Options = {}): boolean => {
  if (typeof str !== "string") {
    throw new TypeError("Expected a string");
  }

  // Default padding to true unless urlSafe is true
  const opts: Base64Options = {
    urlSafe: false,
    padding: options.urlSafe === undefined ? true : !options.urlSafe,
    ...options
  };

  if (str === "") return true;

  let regex;
  if (opts.urlSafe) {
    regex = opts.padding ? base64UrlWithPadding : base64UrlWithoutPadding;
  } else {
    regex = opts.padding ? base64WithPadding : base64WithoutPadding;
  }

  return (!opts.padding || str.length % 4 === 0) && regex.test(str);
};

export const getBase64SizeInBytes = (base64String: string) => {
  return Buffer.from(base64String, "base64").length;
};
