/**
 * Normalizes free text bound for an audit record: C0/C1 controls, ANSI escapes, bidirectional
 * overrides and zero-width characters. All are legal in JSON, so well-formed output says nothing
 * about how a value renders in a terminal, a CSV export or a line-based SIEM.
 *
 * Reject at the API boundary, where the caller can correct its input; strip on the way into the
 * log, where dropping the event would lose the record.
 *
 * Code points are named rather than escaped: a literal control character in the source is invisible
 * to a reader and trips no-irregular-whitespace.
 */

const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);

// ESC-introduced sequences. The OSC terminator is required: with it optional, an unterminated
// `ESC ]` matches to end of string and silently deletes the rest of the value. An unterminated
// introducer falls through to the single-character branch instead, which removes `ESC ]` alone.
// That branch's `[@-Z\-_]` class covers 0x40-0x5A and 0x5C-0x5F, so it matches `]` but not `[`;
// CSI is listed first to catch `ESC [` before it.
const ANSI_ESCAPE_PATTERN = new RegExp(
  `${ESC}(?:\\[[0-?]*[ -/]*[@-~]|\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)|[@-Z\\\\-_])`,
  "g"
);

// Whitespace controls carry word boundaries, so a run collapses to a single space rather than being
// deleted, which would run the surrounding words together.
const WHITESPACE_CONTROL_RUN = /[\t\n\v\f\r]+/g;

const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;

const isControlCharacter = (code: number) => code <= 0x1f || (code >= 0x7f && code <= 0x9f);

// Bidi overrides, embeddings and isolates, LRM/RLM, ZWSP and the BOM. U+200C/U+200D (ZWNJ/ZWJ) are
// deliberately excluded: they are ordinary text, joining emoji sequences and Persian, Arabic and
// Indic script, so removing them corrupts the value rather than neutralizing it.
const isInvisibleCharacter = (code: number) =>
  code === 0x200b ||
  code === 0x200e ||
  code === 0x200f ||
  (code >= 0x202a && code <= 0x202e) ||
  (code >= 0x2066 && code <= 0x2069) ||
  code === 0xfeff;

const isUnsafeCharacter = (character: string) => {
  const code = character.charCodeAt(0);
  return isControlCharacter(code) || isInvisibleCharacter(code);
};

// `allowMultiline` is for fields a user types into a textarea, where a line break or tab is ordinary
// input. CR is included so CRLF-separated content is not rejected. The sink-side strip still
// collapses them, so the stored record stays single-line.
export const containsLogUnsafeCharacters = (value: string, { allowMultiline = false } = {}): boolean => {
  ANSI_ESCAPE_PATTERN.lastIndex = 0;
  if (ANSI_ESCAPE_PATTERN.test(value)) return true;

  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    if (allowMultiline && (code === LINE_FEED || code === TAB || code === CARRIAGE_RETURN)) return false;
    return isUnsafeCharacter(character);
  });
};

export const sanitizeLogText = <T extends string | null | undefined>(value: T): T => {
  if (typeof value !== "string") return value;

  // Sequences first, so a body leaves with its introducer rather than surviving as visible text.
  const collapsed = value.replace(ANSI_ESCAPE_PATTERN, "").replace(WHITESPACE_CONTROL_RUN, " ");

  return Array.from(collapsed)
    .filter((character) => !isUnsafeCharacter(character))
    .join("") as T;
};

// Audit metadata is shallow; the cap bounds recursion on arbitrary input. Past it the subtree is
// replaced by a marker rather than dropped, so the truncation is visible in the record itself and an
// array element cannot become a hole that serializes to null.
const MAX_SANITIZE_DEPTH = 12;
export const DEPTH_LIMIT_MARKER = "[truncated: nesting depth limit]";

// Two keys can normalize to the same string, so a collision is suffixed rather than left to
// overwrite and silently drop a field.
const disambiguate = (key: string, taken: Set<string>) => {
  if (!taken.has(key)) return key;

  let suffix = 2;
  while (taken.has(`${key}~${suffix}`)) suffix += 1;
  return `${key}~${suffix}`;
};

// Keys are sanitized alongside values: a flattening exporter renders both.
export const sanitizeLogPayload = <T>(payload: T, depth = 0): T => {
  if (typeof payload === "string") return sanitizeLogText(payload) as T;
  if (payload === null || typeof payload !== "object") return payload;
  if (depth >= MAX_SANITIZE_DEPTH) return DEPTH_LIMIT_MARKER as T;

  if (Array.isArray(payload)) {
    return (payload as unknown[]).map((item) => sanitizeLogPayload(item, depth + 1)) as T;
  }

  const taken = new Set<string>();
  return Object.fromEntries(
    Object.entries(payload as Record<string, unknown>).map(([key, value]) => {
      const sanitizedKey = disambiguate(sanitizeLogText(key), taken);
      taken.add(sanitizedKey);
      return [sanitizedKey, sanitizeLogPayload(value, depth + 1)];
    })
  ) as T;
};
