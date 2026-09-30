export const VARIABLE_KEY_MAX_LENGTH = 64;
export const VARIABLE_VALUE_MAX_LENGTH = 8192;
export const MAX_REFERENCES_PER_FIELD = 3;

export const VARIABLE_KEY_RE = /^[A-Z][A-Z0-9_]*$/;

export const VARIABLE_KEY_MESSAGE =
  "Start with a letter, then use upper case letters, numbers and underscores, like GITHUB_TOKEN.";

// Every {{...}} counts as a reference, so a malformed one is caught on save instead of being sent to a
// real host as literal text.
const REFERENCE_RE = /\{\{([^{}]*)\}\}/g;

const REFERENCE_ONLY_RE = /^\{\{[A-Z][A-Z0-9_]*\}\}$/;

// An opened reference the caret is still inside, so the suggestions can follow what is typed.
const OPEN_REFERENCE_RE = /\{\{([A-Za-z0-9_]*)$/;

export const toVariableReference = (key: string) => `{{${key}}}`;

export const findVariableReferences = (text: string) =>
  Array.from(text.matchAll(REFERENCE_RE), (match) => match[1]);

export const findVariableKeys = (text: string) =>
  Array.from(new Set(findVariableReferences(text).filter((ref) => VARIABLE_KEY_RE.test(ref))));

/** A lone reference holds no secret, so a masked field can show it as text. */
export const isVariableReferenceOnly = (text: string | undefined) =>
  Boolean(text) && REFERENCE_ONLY_RE.test(text as string);

/** Upper cases the input and turns spaces and dashes into underscores, so `github-token` lands valid. */
export const normalizeVariableKey = (input: string) => input.toUpperCase().replace(/[\s-]/g, "_");

export type TVariableSegment =
  | { type: "text"; text: string }
  | { type: "reference"; text: string; key: string; isValid: boolean };

/** Splits a value into literal text and the references in it, in order, so each can render on its own. */
export const splitVariableReferences = (text: string): TVariableSegment[] => {
  const segments: TVariableSegment[] = [];
  let last = 0;
  Array.from(text.matchAll(REFERENCE_RE)).forEach((match) => {
    const start = match.index ?? 0;
    if (start > last) segments.push({ type: "text", text: text.slice(last, start) });
    segments.push({
      type: "reference",
      text: match[0],
      key: match[1],
      isValid: VARIABLE_KEY_RE.test(match[1])
    });
    last = start + match[0].length;
  });
  if (last < text.length) segments.push({ type: "text", text: text.slice(last) });
  return segments;
};

/** Where an unfinished reference starts and what has been typed of its key, or null. */
export const findOpenVariableReference = (textBeforeCaret: string) => {
  const match = OPEN_REFERENCE_RE.exec(textBeforeCaret);
  return match ? { start: match.index, query: match[1] } : null;
};

/**
 * The first problem with the references in a field, or null. Without `keys`, which is the case while
 * the list loads, only the shape of each reference is checked.
 */
export const variableReferenceError = (text: string, keys?: ReadonlySet<string>): string | null => {
  const refs = findVariableReferences(text);

  if (refs.length > MAX_REFERENCES_PER_FIELD) {
    return `Use at most ${MAX_REFERENCES_PER_FIELD} variable references in one value. A repeated reference counts each time.`;
  }

  const malformed = refs.find((ref) => !VARIABLE_KEY_RE.test(ref));
  if (malformed !== undefined) {
    return `"${toVariableReference(malformed)}" is not a variable. Keys are upper case, like GITHUB_TOKEN.`;
  }

  const missing = keys ? refs.find((ref) => !keys.has(ref)) : undefined;
  if (missing) return `This bundle has no variable named ${missing}. Add it under Variables first.`;

  return null;
};
