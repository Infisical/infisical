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

// Lone surrogates. Postgres jsonb rejects them just like NUL, which fails the whole audit batch.
const isSurrogate = (code: number) => code >= 0xd800 && code <= 0xdfff;

// "Cf except ZWNJ/ZWJ". The whole Cf category since Unicode keeps adding to it, but ZWNJ/ZWJ are real
// text (emoji sequences, Persian, Arabic and Indic scripts). The patterns below add C0/C1 controls and
// the invisible stuff Cf misses: U+2028/U+2029 and the tags block.
const FORMAT_EXCEPT_JOINERS = "[^\\P{Cf}\\x{200C}\\x{200D}]";

const UNSAFE_SINGLE_LINE = new RE2(
  `${FORMAT_EXCEPT_JOINERS}|[\\x00-\\x1f\\x7f-\\x9f\\x{2028}\\x{2029}\\x{E0000}-\\x{E007F}]`,
  "u"
);

// Multiline fields allow tab, LF, CR and U+2028/U+2029. CR is allowed so CRLF input passes, the sink
// turns it into LF.
const UNSAFE_MULTILINE = new RE2(
  `${FORMAT_EXCEPT_JOINERS}|[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f-\\x9f\\x{E0000}-\\x{E007F}]`,
  "u"
);

// What the sink removes: everything except tab and LF, which stay as typed.
const SINK_UNSAFE = `${FORMAT_EXCEPT_JOINERS}|[\\x00-\\x08\\x0b-\\x1f\\x7f-\\x9f\\x{2028}\\x{2029}\\x{E0000}-\\x{E007F}]`;
const NEEDS_CLEANING = new RE2(SINK_UNSAFE, "u");
const STRIPPED = new RE2(SINK_UNSAFE, "gu");

// RE2 turns lone surrogates into U+FFFD before matching, so it can't see them. isWellFormed can.
const isClean = (value: string) => value.isWellFormed() && !NEEDS_CLEANING.test(value);

export const LOG_UNSAFE_TEXT_MESSAGE = "Value cannot contain control, escape, bidirectional or zero-width characters";

// `allowMultiline` is for textarea fields.
export const containsLogUnsafeCharacters = (value: string, { allowMultiline = false } = {}): boolean =>
  !value.isWellFormed() || (allowMultiline ? UNSAFE_MULTILINE : UNSAFE_SINGLE_LINE).test(value);

export const sanitizeLogText = <T extends string | null | undefined>(value: T): T => {
  if (typeof value !== "string") return value;
  if (isClean(value)) return value;

  // Lone surrogates go before any RE2 call, which would turn them into U+FFFD.
  const wellFormed = value.isWellFormed()
    ? value
    : Array.from(value)
        .filter((character) => !isSurrogate(character.codePointAt(0) ?? 0))
        .join("");

  // Whole sequences first, otherwise dropping ESC alone leaves the rest as visible text.
  return wellFormed
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(LINE_BREAK_VARIANTS, "\n")
    .replace(VERTICAL_WHITESPACE, " ")
    .replace(STRIPPED, "") as T;
};

// Two keys can clean up to the same string, so suffix the second one instead of losing a field.
// `nextSuffix` resumes the search where the last one stopped. Restarting at 2 is quadratic, and the
// keys are user input (OIDC bound claims), so thousands of look-alikes would stall the audit queue.
const disambiguate = (key: string, taken: Set<string>, nextSuffix: Map<string, number>) => {
  if (!taken.has(key)) return key;

  let suffix = nextSuffix.get(key) ?? 2;
  while (taken.has(`${key}~${suffix}`)) suffix += 1;
  nextSuffix.set(key, suffix + 1);
  return `${key}~${suffix}`;
};

// Almost every payload is clean, so check first and only copy when something needs to change.
const isPayloadClean = (payload: object) => {
  const pending: unknown[] = [payload];
  while (pending.length) {
    const node = pending.pop();
    if (typeof node === "string") {
      if (!isClean(node)) return false;
    } else if (node !== null && typeof node === "object") {
      if (Array.isArray(node)) {
        for (const item of node) pending.push(item);
      } else {
        for (const [key, value] of Object.entries(node)) {
          if (!isClean(key)) return false;
          pending.push(value);
        }
      }
    }
  }
  return true;
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
  if (isPayloadClean(payload)) return payload;

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
      const entries = Object.entries(source as Record<string, unknown>);
      // Clean keys claim their names first. Otherwise a look-alike `email` with a zero-width space, listed
      // first, would take the name and push the real field to `email~2`.
      const cleanKeys = new Set(entries.filter(([key]) => isClean(key)).map(([key]) => key));
      const taken = new Set(cleanKeys);
      const nextSuffix = new Map<string, number>();
      entries.forEach(([key, value]) => {
        if (cleanKeys.has(key)) {
          assign(key, value);
          return;
        }
        const sanitizedKey = disambiguate(sanitizeLogText(key), taken, nextSuffix);
        taken.add(sanitizedKey);
        assign(sanitizedKey, value);
      });
    }
  }

  return root as T;
};
