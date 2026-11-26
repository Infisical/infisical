import handlebars from "handlebars";
import picomatch from "picomatch";

export type TRuleLike = {
  action: string | string[];
  subject?: string | string[];
  inverted?: boolean;
  conditions?: unknown;
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

  // The matcher runs once per suffix position below, so each wildcard multiplies backtracking across the whole scan.
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

const handlebarsClient = (() => {
  const hbs = handlebars.create();

  hbs.registerHelper("stripPrefix", hbsStripPrefix);
  hbs.registerHelper("trimSuffix", hbsTrimSuffix);

  return hbs;
})();

// CASL wildcards: "manage" matches every action on a subject, "all" matches every subject.
const CASL_MANAGE_ACTION = "manage";
const CASL_ALL_SUBJECT = "all";

// `identity.auth.*` only exists for the live requester. Rendered without it, the condition collapses to an empty
// string that nothing satisfies, and a privilege boundary would read that as a grant anyone outranks. So rules that
// reference it keep their mustaches and stay unsatisfiable on both sides.
const AUTH_TEMPLATE_PATH = "identity.auth";

// "all" (org/project admin) fans out to every allowed subject.
const resolveTargetSubjects = (ruleSubject: string | undefined, allowed: Map<string, Set<string>>): string[] => {
  if (ruleSubject === CASL_ALL_SUBJECT) return [...allowed.keys()];
  if (ruleSubject && allowed.has(ruleSubject)) return [ruleSubject];
  return [];
};

// Order matters: in CASL the last matching rule wins.
export class RuleSet<TRule extends TRuleLike = TRuleLike> {
  private constructor(private readonly list: TRule[]) {}

  static of<T extends TRuleLike>(rules: T[]): RuleSet<T> {
    return new RuleSet<T>([...rules]);
  }

  static empty<T extends TRuleLike>(): RuleSet<T> {
    return new RuleSet<T>([]);
  }

  // Denies go last so one role's allow can't undo another role's deny.
  static merge<T extends TRuleLike>(sets: T[][]): RuleSet<T> {
    const flat = sets.flat();
    const isDeny = (rule: T) => Boolean(rule.inverted);
    return new RuleSet<T>([...flat.filter((rule) => !isDeny(rule)), ...flat.filter(isDeny)]);
  }

  get rules(): TRule[] {
    return [...this.list];
  }

  // Where both match, `later` wins.
  then(later: RuleSet<TRule>): RuleSet<TRule> {
    return new RuleSet<TRule>([...this.list, ...later.list]);
  }

  interpolate(context: Record<string, unknown>): RuleSet<TRule> {
    return new RuleSet<TRule>(RuleSet.render(this.list, context));
  }

  // For rules read on behalf of someone other than the requester (privilege boundary, member listing). Rules that
  // read `identity.auth` keep their mustaches (see AUTH_TEMPLATE_PATH).
  interpolateStored(context: Record<string, unknown>): RuleSet<TRule> {
    const serialized = JSON.stringify(this.list);
    if (!serialized.includes("{{")) return this;
    if (!serialized.includes(AUTH_TEMPLATE_PATH)) return this.interpolate(context);
    return new RuleSet<TRule>(
      this.list.map((rule) =>
        JSON.stringify(rule).includes(AUTH_TEMPLATE_PATH) ? rule : RuleSet.render([rule], context)[0]
      )
    );
  }

  // Builds the input for narrowTo.
  static allowlistOf(entries: { subject: string; actions: string[] }[]): Map<string, Set<string>> {
    const allowed = new Map<string, Set<string>>();
    entries.forEach(({ subject, actions }) => {
      const existing = allowed.get(subject) ?? new Set<string>();
      actions.forEach((action) => existing.add(action));
      allowed.set(subject, existing);
    });
    return allowed;
  }

  // Narrows to e.g. a delegated OAuth token's scopes. Only ever subtracts: out-of-scope allows are dropped and denies
  // are kept since they only restrict.
  narrowTo(allowed: Map<string, Set<string>>): RuleSet<TRule> {
    return new RuleSet<TRule>(
      this.list.flatMap((rule) => {
        if (rule.inverted) return [rule];
        const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
        const ruleActions = Array.isArray(rule.action) ? rule.action : [rule.action];
        const grantsManage = ruleActions.includes(CASL_MANAGE_ACTION);
        return ruleSubjects.flatMap((ruleSubject) =>
          resolveTargetSubjects(ruleSubject, allowed).flatMap((subject) => {
            const allowedActions = allowed.get(subject) ?? new Set<string>();
            const actions = grantsManage
              ? [...allowedActions]
              : ruleActions.filter((action) => allowedActions.has(action));
            return actions.length ? [{ ...rule, subject, action: actions }] : [];
          })
        );
      })
    );
  }

  private static render<T>(rules: T[], context: Record<string, unknown>): T[] {
    const serialized = JSON.stringify(rules);
    if (!serialized.includes("{{")) return rules;
    const template = handlebarsClient.compile(serialized, { data: false });
    return JSON.parse(template(context, { data: false })) as T[];
  }
}
