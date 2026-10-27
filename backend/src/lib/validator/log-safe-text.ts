import RE2 from "re2";

/**
 * Cleans free text headed for audit logs: control chars, ANSI escapes, bidi overrides and invisible
 * formatting chars. They're all valid JSON but can still mess up terminals, CSV exports and SIEMs.
 *
 * Line breaks and tabs stay. Consumers JSON-encode them anyway, and some fields (PAM reasons) are
 * multiline on purpose.
 *
 * We reject at the API, where the caller can fix the input, and strip on the way into the log,
 * where dropping the event would lose the record.
 */

// Built with fromCharCode because a literal control char is invisible and trips no-irregular-whitespace.
const ESC = String.fromCharCode(0x1b);
const BEL = String.fromCharCode(0x07);

// The OSC terminator is required. If it were optional, an unterminated `ESC ]` would match to the end
// and wipe the rest of the value. The single-char branch matches `]` but not `[`, so CSI goes first.
const ANSI_ESCAPE_PATTERN = new RE2(
  `${ESC}(?:\\[[0-?]*[ -/]*[@-~]|\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\)|[@-Z\\\\-_])`,
  "g"
);

// CRLF, lone CR and U+2028/U+2029 all become LF. A bare CR lets text overwrite the line in a terminal,
// and JSON.stringify doesn't escape U+2028/U+2029.
const LINE_BREAK_VARIANTS = new RE2("\\r\\n?|[\\u2028\\u2029]", "g");

// VT and FF become a space so words don't run together.
const VERTICAL_WHITESPACE = new RE2("[\\v\\f]", "g");

const KEPT_WHITESPACE = new Set([0x09, 0x0a]);

// What a multiline field may contain. U+2028/U+2029 split lines too, so single-line fields reject them.
const LINE_BREAKS = new Set([0x09, 0x0a, 0x0d, 0x2028, 0x2029]);

const isControlCharacter = (code: number) => code <= 0x1f || (code >= 0x7f && code <= 0x9f);

// The whole Cf category instead of a hand-picked list, since Unicode keeps adding to it.
const FORMAT_CATEGORY = new RE2("\\p{Cf}", "u");

// ZWNJ/ZWJ are Cf but they're real text: emoji sequences and Persian, Arabic and Indic scripts need them.
const TEXT_JOINERS = new Set([0x200c, 0x200d]);

// Invisible stuff Cf misses: the line/paragraph separators and the tags block.
const isUncategorizedFormat = (code: number) =>
  code === 0x2028 || code === 0x2029 || (code >= 0xe0000 && code <= 0xe007f);

// Cheap whole-string check before the per-char walk, which costs one RE2 call per char (~30x slower).
// Audit text is almost always clean. It over-matches ZWNJ, ZWJ, LF and tab, so those just get walked.
const UNSAFE_SCREEN = new RE2("[\\x00-\\x1f\\x7f-\\x9f\\x{2028}\\x{2029}]|[\\x{E0000}-\\x{E007F}]|\\p{Cf}", "u");

// codePointAt, not charCodeAt: past U+FFFF charCodeAt only sees a surrogate half and never matches.
const isUnsafeCharacter = (character: string) => {
  const code = character.codePointAt(0) ?? 0;
  if (TEXT_JOINERS.has(code)) return false;

  return isControlCharacter(code) || isUncategorizedFormat(code) || FORMAT_CATEGORY.test(character);
};

export const LOG_UNSAFE_TEXT_MESSAGE = "Value cannot contain control, escape, bidirectional or zero-width characters";

// `allowMultiline` is for textarea fields. CR is allowed so CRLF input passes, the sink turns it into LF.
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

  // Whole sequences first, otherwise dropping ESC alone leaves the rest as visible text.
  const normalized = value
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(LINE_BREAK_VARIANTS, "\n")
    .replace(VERTICAL_WHITESPACE, " ");

  return Array.from(normalized)
    .filter((character) => KEPT_WHITESPACE.has(character.codePointAt(0) ?? 0) || !isUnsafeCharacter(character))
    .join("") as T;
};

// Two keys can clean up to the same string, so suffix the second one instead of losing a field.
const disambiguate = (key: string, taken: Set<string>) => {
  if (!taken.has(key)) return key;

  let suffix = 2;
  while (taken.has(`${key}~${suffix}`)) suffix += 1;
  return `${key}~${suffix}`;
};

const emptyLike = (node: object) => (Array.isArray(node) ? [] : {}) as Record<string, unknown> | unknown[];

/**
 * Cleans every string in a metadata payload, keys too, since flattening exporters show both.
 *
 * No depth limit on purpose: nesting is legit (`oidcClaimsReceived` holds whatever the IdP sent) and
 * truncating would change the shape consumers parse. Input always comes from JSON.parse, so it's
 * finite and acyclic.
 */
export const sanitizeLogPayload = <T>(payload: T): T => {
  if (typeof payload === "string") return sanitizeLogText(payload) as T;
  if (payload === null || typeof payload !== "object") return payload;

  const root = emptyLike(payload);
  const pending: [source: object, target: Record<string, unknown> | unknown[]][] = [[payload, root]];

  while (pending.length) {
    const [source, target] = pending.pop()!;

    // defineProperty, not assignment: a `__proto__` key (IdP claims can have one) would set the prototype.
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
