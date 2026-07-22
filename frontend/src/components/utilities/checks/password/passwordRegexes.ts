// This regex covers letters (case insensitive) for the top 50 most spoken languages
/* eslint-disable no-misleading-character-class */
export const letterCharRegex =
  /[A-Za-z\u00C0-\u00D6\u00D8-\u00DE\u00DF-\u00F6\u00F8-\u00FF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u0600-\u06FF\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F\u05B0-\u05FF\u0980-\u09FF\u1F00-\u1FFF\u0130\u015E\u011E\u00C7\u00FC\u00FB\u00EB\u00E7]/u;

// This regex covers digits, special characters, symbols, and emojis.
export const numAndSpecialCharRegex = /[\d!@#$%^&*(),.?":{}|<>]|[^\p{L}\p{N}\s]/u;

// This regex covers 3 repeated consecutive chars (incl. spaces)
export const repeatedCharRegex = /(.)\1\1\1|\s{4,}/;

// This regex covers the escape sequences as a precaution
export const escapeCharRegex = /[\n\t\r\\]/;
