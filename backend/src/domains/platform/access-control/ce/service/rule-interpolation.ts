import handlebars from "handlebars";
import picomatch from "picomatch";

// Fills `{{identity.*}}` placeholders in permission rules: a custom role or privilege can condition on the
// actor's id, username, attributes and, for an identity, its auth details.

export const escapeHandlebarsMissingDict = (obj: Record<string, string>, key: string) => {
  const handler = {
    get(target: Record<string, string>, prop: string) {
      if (!Object.hasOwn(target, prop)) {
        // eslint-disable-next-line no-param-reassign
        target[prop] = `{{${key}.${prop}}}`; // Add missing key as an "own" property
      }
      return target[prop];
    }
  };

  return new Proxy(obj, handler);
};

const HBS_TRIM_SUFFIX_MAX_GLOB_INPUT_LENGTH = 256;
const HBS_TRIM_SUFFIX_MAX_GLOB_WILDCARDS = 5;

const hbsStripPrefix = (text: string, prefix: string) => {
  const textStr = String(text || "");
  if (!textStr) return textStr;

  return textStr.startsWith(prefix) ? textStr.substring(prefix.length) : textStr;
};

const hbsTrimSuffix = (text: string, suffix: string) => {
  const textStr = String(text || "");
  if (!textStr) return textStr;

  if (typeof suffix !== "string" || !suffix) return textStr;

  if (suffix.length > HBS_TRIM_SUFFIX_MAX_GLOB_INPUT_LENGTH) return textStr;

  if (!picomatch.scan(suffix).isGlob) {
    return textStr.endsWith(suffix) ? textStr.slice(0, -suffix.length) : textStr;
  }

  // the matcher is run once per suffix position below, so every variable-length wildcard multiplies
  // the backtracking across that whole scan.
  const wildcardCount = [...suffix].filter((char) => char === "*" || char === "?").length;
  if (wildcardCount > HBS_TRIM_SUFFIX_MAX_GLOB_WILDCARDS) return textStr;

  if (textStr.length > HBS_TRIM_SUFFIX_MAX_GLOB_INPUT_LENGTH) return textStr;

  let isSuffixMatch: (input: string) => boolean;
  try {
    isSuffixMatch = picomatch(suffix, { dot: true });
  } catch {
    return textStr;
  }

  for (let i = textStr.length; i >= 0; i -= 1) {
    if (isSuffixMatch(textStr.slice(i))) return textStr.slice(0, i);
  }

  return textStr;
};

export const handlebarsClient = (() => {
  const hbs = handlebars.create();

  hbs.registerHelper("stripPrefix", hbsStripPrefix);
  hbs.registerHelper("trimSuffix", hbsTrimSuffix);

  return hbs;
})();

export const isActiveRole = <U extends { isTemporary?: boolean; temporaryAccessEndTime?: Date | null }>(
  role: U
): boolean =>
  !role.isTemporary ||
  Boolean(role.isTemporary && role.temporaryAccessEndTime && new Date() < role.temporaryAccessEndTime);

// Compiling a template is the most expensive step of building an ability, and almost no rule set needs
// it: built-in roles carry no `{{ }}` at all, only custom roles with identity conditions do. A template
// with no mustaches renders byte-identical to its input, so serializing once to look for one and
// returning the rules untouched skips the compile, the render and the reparse.
export const interpolatePermissionRules = <T>(rules: T[], identityContext: Record<string, unknown>): T[] => {
  const serializedRules = JSON.stringify(rules);

  if (!serializedRules.includes("{{")) return rules;

  const templatedRules = handlebarsClient.compile(serializedRules, { data: false });

  return JSON.parse(templatedRules(identityContext, { data: false })) as T[];
};

// `identity.auth.*` is read off the credential an identity authenticates with, so it is knowable only
// for the actor of the live request. Rendered against a context that lacks it, the mustache collapses to
// an empty string, and the condition it guarded turns into one nothing satisfies, which reads to a
// privilege boundary as a grant anybody outranks. Rules that reference it keep their mustaches instead,
// so they stay unsatisfiable on both sides of the comparison.
const AUTH_TEMPLATE_PATH = "identity.auth";

export const interpolateStoredIdentityRules = <T>(rules: T[], identityContext: Record<string, unknown>): T[] => {
  const serializedRules = JSON.stringify(rules);

  if (!serializedRules.includes("{{")) return rules;
  if (!serializedRules.includes(AUTH_TEMPLATE_PATH)) return interpolatePermissionRules(rules, identityContext);

  return rules.map((rule) =>
    JSON.stringify(rule).includes(AUTH_TEMPLATE_PATH) ? rule : interpolatePermissionRules([rule], identityContext)[0]
  );
};
