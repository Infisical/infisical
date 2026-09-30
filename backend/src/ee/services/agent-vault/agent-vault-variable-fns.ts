import RE2 from "re2";

export const AGENT_VAULT_VARIABLE_KEY_MAX_LENGTH = 64;
export const AGENT_VAULT_VARIABLE_VALUE_MAX_LENGTH = 8192;
export const AGENT_VAULT_MAX_VARIABLES = 100;
// Counts every {{...}}, a repeat included: repeating one short reference is what lets a field fill in to
// millions of characters.
export const AGENT_VAULT_MAX_REFERENCES_PER_FIELD = 10;
// No field that takes a variable accepts more than this typed out, and filled in it is held to the same.
export const AGENT_VAULT_EXPANDED_FIELD_MAX_LENGTH = 8192;

export const AGENT_VAULT_VARIABLE_KEY_RE = new RE2(/^[A-Z][A-Z0-9_]*$/);

export const AGENT_VAULT_VARIABLE_KEY_MESSAGE =
  "A variable key starts with a letter and uses only upper case letters, numbers and underscores, like GITHUB_TOKEN.";

// Never quotes the offending text: it was cut from a secret field, and a 400's message is logged.
export const AGENT_VAULT_MALFORMED_REFERENCE_MESSAGE = `Double braces are reserved for variable references, like {{GITHUB_TOKEN}}. ${AGENT_VAULT_VARIABLE_KEY_MESSAGE}`;

export const AGENT_VAULT_TOO_MANY_REFERENCES_MESSAGE = `A value can use at most ${AGENT_VAULT_MAX_REFERENCES_PER_FIELD} variable references, and a reference that repeats counts each time. Combine some into one variable to use fewer.`;

// Every {{...}} counts as a reference, so a mistyped one fails the save instead of reaching a real host as
// literal text.
const REFERENCE_RE = new RE2(/\{\{([^{}]*)\}\}/g);
const STORED_REFERENCE_RE = new RE2(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

export const toVariableReference = (key: string) => `{{${key}}}`;

export const isVariableKey = (candidate: string) => AGENT_VAULT_VARIABLE_KEY_RE.test(candidate);

const findReferenceTokens = (text: string) => Array.from(text.matchAll(REFERENCE_RE), (match) => match[1]);

export const hasMalformedVariableReference = (text: string) =>
  findReferenceTokens(text).some((token) => !isVariableKey(token));

export const hasTooManyVariableReferences = (text: string) =>
  findReferenceTokens(text).length > AGENT_VAULT_MAX_REFERENCES_PER_FIELD;

export const findVariableKeys = (text: string) => [
  ...new Set(findReferenceTokens(text).filter((token) => isVariableKey(token)))
];

/**
 * Sealed text names a variable by its id, not its key. The key form exists only at the API boundary, so a
 * rename touches one row, and resolve can never read a field and a key from either side of one.
 */
export const toStoredVariableReferences = (text: string, idOfKey: ReadonlyMap<string, string>) =>
  text.replace(REFERENCE_RE, (token: string, key: string) => {
    const id = idOfKey.get(key);
    return id ? toVariableReference(id) : token;
  });

// Only id-shaped tokens, so the lookup never hands Postgres a non-uuid and legacy literal braces never match.
export const findStoredVariableIds = (text: string) => [
  ...new Set(findReferenceTokens(text).filter((token) => STORED_REFERENCE_RE.test(token)))
];

/**
 * How long stored text comes out once its references are filled in, measured without building it. An id with
 * no length behind it counts as its own token, which is what expanding leaves in its place.
 */
export const filledInVariableLength = (text: string, lengthOfId: (variableId: string) => number | undefined) =>
  Array.from(text.matchAll(REFERENCE_RE)).reduce((length, [token, inner]) => {
    const valueLength = STORED_REFERENCE_RE.test(inner) ? lengthOfId(inner) : undefined;
    return valueLength === undefined ? length : length + valueLength - token.length;
  }, text.length);

/**
 * Anything that is not a known variable id stays as it was stored. A value saved before variables existed
 * can hold literal braces, and it has to keep reaching the host unchanged.
 *
 * Returns undefined, without building the text, when it would come out longer than
 * AGENT_VAULT_EXPANDED_FIELD_MAX_LENGTH. The input limits alone don't hold it there: ten references to 8,192
 * character values fill one field in to over 80,000 characters.
 */
export const expandStoredVariableReferences = (
  text: string,
  valueOfId: (variableId: string) => string | undefined
): string | undefined => {
  const valueOf = (inner: string) => (STORED_REFERENCE_RE.test(inner) ? valueOfId(inner) : undefined);

  if (
    filledInVariableLength(text, (variableId) => valueOfId(variableId)?.length) > AGENT_VAULT_EXPANDED_FIELD_MAX_LENGTH
  ) {
    return undefined;
  }

  return text.replace(REFERENCE_RE, (token: string, inner: string) => valueOf(inner) ?? token);
};
