import RE2 from "re2";

/**
 * Normalizes free text bound for an audit record: C0/C1 controls, ANSI escapes, bidirectional
 * overrides and invisible formatting characters. All are legal in JSON, so well-formed output says
 * nothing about how a value renders in a terminal, a CSV export or a line-based SIEM.
 *
 * Line breaks and tabs are kept. Every audit consumer JSON-encodes the value, which escapes them, and
 * some fields are multiline by design (PAM reasons); the credential-view reason is recorded nowhere
 * but the audit log, so collapsing it would lose what the user typed.
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

// CRLF and a lone CR become LF: a bare CR returns a terminal's cursor to the start of the line, so the
// rest of the value overprints what was already shown. U+2028/U+2029 become LF too, because
// JSON.stringify leaves them unescaped.
const LINE_BREAK_VARIANTS = new RE2("\\r\\n?|[\\u2028\\u2029]", "g");

// VT and FF still mark a word boundary, so they become a space rather than running words together.
const VERTICAL_WHITESPACE = new RE2("[\\v\\f]", "g");

const KEPT_WHITESPACE = new Set([0x09, 0x0a]);

// The line-break set a multiline field is allowed to contain. U+2028/U+2029 are line and paragraph
// separators: not C0 controls, but line breaks to anything that splits on them, so a single-line
// field has to reject them too.
const LINE_BREAKS = new Set([0x09, 0x0a, 0x0d, 0x2028, 0x2029]);

const isControlCharacter = (code: number) => code <= 0x1f || (code >= 0x7f && code <= 0x9f);

// The whole Unicode format category, rather than a list of its members: an enumeration of invisible
// code points is a category Unicode keeps extending, and it has already been extended past two
// rounds of this one.
const FORMAT_CATEGORY = new RE2("\\p{Cf}", "u");

// U+200C/U+200D (ZWNJ/ZWJ) are in that category but are ordinary text, joining emoji sequences and
// Persian, Arabic and Indic script. Variation selectors are marks rather than format characters, so
// they survive without an exclusion.
const TEXT_JOINERS = new Set([0x200c, 0x200d]);

// What the category misses: U+2028/U+2029 are line and paragraph separators, and the unassigned
// half of the tags block is ignorable in rendering without being classified.
const isUncategorizedFormat = (code: number) =>
  code === 0x2028 || code === 0x2029 || (code >= 0xe0000 && code <= 0xe007f);

// A whole-string screen, run before the per-character walk below. The walk crosses into RE2 once per
// character, which measures ~30x the cost of the walk itself, and audit text is almost always clean,
// so one call per string answers the common case. The screen over-matches on ZWNJ, ZWJ, LF and tab,
// which only costs those strings a walk that then keeps them.
const UNSAFE_SCREEN = new RE2("[\\x00-\\x1f\\x7f-\\x9f\\x{2028}\\x{2029}]|[\\x{E0000}-\\x{E007F}]|\\p{Cf}", "u");

// codePointAt, not charCodeAt: the astral ranges sit beyond U+FFFF, where charCodeAt would return a
// surrogate half and never match.
const isUnsafeCharacter = (character: string) => {
  const code = character.codePointAt(0) ?? 0;
  if (TEXT_JOINERS.has(code)) return false;

  return isControlCharacter(code) || isUncategorizedFormat(code) || FORMAT_CATEGORY.test(character);
};

// `allowMultiline` is for fields a user types into a textarea, where a line break or tab is ordinary
// input. CR is included so CRLF-separated content is not rejected; the sink normalizes it to LF.
export const containsLogUnsafeCharacters = (value: string, { allowMultiline = false } = {}): boolean => {
  if (!UNSAFE_SCREEN.test(value)) return false;

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
  if (!UNSAFE_SCREEN.test(value)) return value;

  // Sequences first, so a body leaves with its introducer rather than surviving as visible text.
  const normalized = value
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(LINE_BREAK_VARIANTS, "\n")
    .replace(VERTICAL_WHITESPACE, " ");

  return Array.from(normalized)
    .filter((character) => KEPT_WHITESPACE.has(character.codePointAt(0) ?? 0) || !isUnsafeCharacter(character))
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

    // defineProperty, not assignment: a `__proto__` key hits the inherited setter and sets the
    // prototype instead of writing a field. Metadata keys come from the IdP on OIDC login.
    const put = (key: string | number, value: unknown) => {
      Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
    };

    const assign = (key: string | number, value: unknown) => {
      if (typeof value === "string") {
        put(key, sanitizeLogText(value));
        return;
      }
      if (value !== null && typeof value === "object") {
        const child = emptyLike(value);
        put(key, child);
        pending.push([value, child]);
        return;
      }
      put(key, value);
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
