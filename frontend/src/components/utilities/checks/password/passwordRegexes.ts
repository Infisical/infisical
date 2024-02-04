// This regex covers letters (case insensitive) for the top 50 most spoken languages
/* eslint-disable no-misleading-character-class */
export const letterCharRegex = /[A-Za-z\u00C0-\u00D6\u00D8-\u00DE\u00DF-\u00F6\u00F8-\u00FF\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u0600-\u06FF\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F\u05B0-\u05FF\u0980-\u09FF\u1F00-\u1FFF\u0130\u015E\u011E\u00C7\u00FC\u00FB\u00EB\u00E7]/u;

// This regex covers digits, special characters, symbols, and emojis.
export const numAndSpecialCharRegex = /[\d!@#$%^&*(),.?":{}|<>]|[^\p{L}\p{N}\s]/u;

// This regex covers 3 repeated consecutive chars (incl. spaces)
export const repeatedCharRegex = /(.)\1\1\1|\s{4,}/;

// This regex covers the escape sequences as a precaution
export const escapeCharRegex = /[\n\t\r\\]/;

// This regex covers some PII and/or low entropy data
export const lowEntropyRegexes = [
  // Email address
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,

  // URL (incl. subdomains, paths, top-level domains & query params)
  /^(?:(?:https?|ftp):\/\/)?(?:\w+\.)?[a-zA-Z0-9.-]+\.(?:com|org|net|edu)(?:\/\S*)?(?:\?\S*)?$/,

  // Date in various formats
  /(\b\d{1,4}[-/.]?\d{1,2}[-/.]?\d{1,4}\b)|(\b\d{1,4}[-/.]?\w{3}[-/.]?\d{1,4}\b)/,

  // Phone numbers (generalized)
  /(?:\+(?:[1-9]\d{0,2})\s?)?(?:\(\d{1,4}\)\s?)?(?:\d[-.\s]?){5,}\d/,

  // Passport numbers (generalized)
  /\b(?:[A-Z0-9]{6,9}|[A-Z0-9]{8,9}|[A-Z0-9]{9}|[A-Z0-9]{10,11})\b/,

  // Driver's license numbers (generalized)
  /\b(?:[A-Z0-9]{7,10}|[A-Z0-9]{10,11}|[A-Z0-9]{7,10})\b/,

  // US social security number
  /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/,
];