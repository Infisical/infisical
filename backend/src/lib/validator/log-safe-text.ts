import RE2 from "re2";

/**
 * Normalizes free text bound for an audit record: C0/C1 controls, ANSI escapes, bidirectional
 * overrides and invisible formatting characters. All are legal in JSON, so well-formed output says
 * nothing about how a value renders in a terminal, a CSV export or a line-based SIEM.
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
const ANSI_ESCAPE_PATTERN = new RE2(
  `${ESC}(?:\\[[0-?]*[ -/]*[@-~]|\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)|[@-Z\\\\-_])`,
  "g"
);

// Whitespace controls carry word boundaries, so a run collapses to a single space rather than being
// deleted, which would run the surrounding words together.
const WHITESPACE_CONTROL_RUN = new RE2("[\\t\\n\\v\\f\\r\\u2028\\u2029]+", "g");

// The line-break set a multiline field is allowed to contain. U+2028/U+2029 are line and paragraph
// separators: not C0 controls, but line breaks to anything that splits on them, so a single-line
// field has to reject them too.
const LINE_BREAKS = new Set([0x09, 0x0a, 0x0d, 0x2028, 0x2029]);

const isControlCharacter = (code: number) => code <= 0x1f || (code >= 0x7f && code <= 0x9f);

// Invisible and bidirectional formatting characters. Two deliberate exclusions: U+200C/U+200D
// (ZWNJ/ZWJ) join emoji sequences and Persian, Arabic and Indic script, and U+FE00-U+FE0F
// (variation selectors) select emoji presentation. Removing either corrupts ordinary text.
const isFormatCharacter = (code: number) =>
  code === 0x061c || // Arabic letter mark
  code === 0x180e || // Mongolian vowel separator
  code === 0x200b || // zero-width space
  code === 0x200e || // left-to-right mark
  code === 0x200f || // right-to-left mark
  (code >= 0x202a && code <= 0x202e) || // bidi embeddings and overrides
  (code >= 0x2060 && code <= 0x2064) || // word joiner and invisible operators
  (code >= 0x2066 && code <= 0x2069) || // bidi isolates
  code === 0x2028 || // line separator
  code === 0x2029 || // paragraph separator
  code === 0xfeff || // byte order mark
  (code >= 0xfff9 && code <= 0xfffb) || // interlinear annotation
  (code >= 0x1d173 && code <= 0x1d17a) || // musical format controls
  (code >= 0xe0000 && code <= 0xe007f); // tags block

// codePointAt, not charCodeAt: the astral ranges above sit beyond U+FFFF, where charCodeAt would
// return a surrogate half and never match.
const isUnsafeCharacter = (character: string) => {
  const code = character.codePointAt(0) ?? 0;
  return isControlCharacter(code) || isFormatCharacter(code);
};

// `allowMultiline` is for fields a user types into a textarea, where a line break or tab is ordinary
// input. CR is included so CRLF-separated content is not rejected. The sink-side strip still
// collapses them, so the stored record stays single-line.
export const containsLogUnsafeCharacters = (value: string, { allowMultiline = false } = {}): boolean => {
  ANSI_ESCAPE_PATTERN.lastIndex = 0;
  if (ANSI_ESCAPE_PATTERN.test(value)) return true;

  return Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    if (allowMultiline && LINE_BREAKS.has(code)) return false;
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

// Two keys can normalize to the same string, so a collision is suffixed rather than left to
// overwrite and silently drop a field.
const disambiguate = (key: string, taken: Set<string>) => {
  if (!taken.has(key)) return key;

  let suffix = 2;
  while (taken.has(`${key}~${suffix}`)) suffix += 1;
  return `${key}~${suffix}`;
};

const emptyLike = (node: object) => (Array.isArray(node) ? [] : {}) as Record<string, unknown> | unknown[];

/**
 * Sanitizes every string in a metadata payload, keys included: a flattening exporter renders both.
 *
 * The walk is iterative and has no depth limit, because the structure is part of the record. An
 * event can legitimately nest (`oidcClaimsReceived` on LOGIN_IDENTITY_OIDC_AUTH carries whatever the
 * IdP returned), and truncating it would retype fields that downstream consumers already parse.
 * Input always arrives from JSON.parse in the audit queue, so it is finite, acyclic and holds no
 * shared references.
 */
export const sanitizeLogPayload = <T>(payload: T): T => {
  if (typeof payload === "string") return sanitizeLogText(payload) as T;
  if (payload === null || typeof payload !== "object") return payload;

  const root = emptyLike(payload);
  const pending: [source: object, target: Record<string, unknown> | unknown[]][] = [[payload, root]];

  while (pending.length) {
    const [source, target] = pending.pop()!;

    const assign = (key: string | number, value: unknown) => {
      if (typeof value === "string") {
        (target as Record<string | number, unknown>)[key] = sanitizeLogText(value);
        return;
      }
      if (value !== null && typeof value === "object") {
        const child = emptyLike(value);
        (target as Record<string | number, unknown>)[key] = child;
        pending.push([value, child]);
        return;
      }
      (target as Record<string | number, unknown>)[key] = value;
    };

    if (Array.isArray(source)) {
      source.forEach((item, index) => assign(index, item));
    } else {
      const taken = new Set<string>();
      Object.entries(source as Record<string, unknown>).forEach(([key, value]) => {
        const sanitizedKey = disambiguate(sanitizeLogText(key), taken);
        taken.add(sanitizedKey);
        assign(sanitizedKey, value);
      });
    }
  }

  return root as T;
};
