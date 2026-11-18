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

const handlebarsClient = (() => {
  const hbs = handlebars.create();

  hbs.registerHelper("stripPrefix", hbsStripPrefix);
  hbs.registerHelper("trimSuffix", hbsTrimSuffix);

  return hbs;
})();

// CASL wildcards: "manage" matches every action on a subject, "all" matches every subject.
const CASL_MANAGE_ACTION = "manage";
const CASL_ALL_SUBJECT = "all";

// `identity.auth.*` is read off the credential an identity authenticates with, so it is knowable only for the actor of
// the live request. Rendered against a context that lacks it, the mustache collapses to an empty string, and the
// condition it guarded turns into one nothing satisfies, which reads to a privilege boundary as a grant anybody
// outranks. Rules that reference it keep their mustaches instead, so they stay unsatisfiable on both sides.
const AUTH_TEMPLATE_PATH = "identity.auth";

// A rule on the CASL "all" subject (an org or project admin) fans out to every allowed subject; any other subject maps
// to itself only when it is allowed, otherwise to nothing.
const resolveTargetSubjects = (ruleSubject: string | undefined, allowed: Map<string, Set<string>>): string[] => {
  if (ruleSubject === CASL_ALL_SUBJECT) return [...allowed.keys()];
  if (ruleSubject && allowed.has(ruleSubject)) return [ruleSubject];
  return [];
};

// An ordered list of CASL rules. CASL lets the last matching rule decide, so the order is the precedence: merge keeps
// a deny from one role from being undone by another's allow, and then lets a later layer decide where it matches.
export class RuleSet<TRule extends object = TRuleLike> {
  private constructor(private readonly list: TRule[]) {}

  static of<T extends object>(rules: T[]): RuleSet<T> {
    return new RuleSet<T>([...rules]);
  }

  static empty<T extends object>(): RuleSet<T> {
    return new RuleSet<T>([]);
  }

  // Rules held together (several roles): everything any of them allows, and any of them can deny. Cannot rules go
  // last, keeping each run in its order.
  static merge<T extends object>(sets: T[][]): RuleSet<T> {
    const flat = sets.flat();
    const isDeny = (rule: T) => Boolean((rule as TRuleLike).inverted);
    return new RuleSet<T>([...flat.filter((rule) => !isDeny(rule)), ...flat.filter(isDeny)]);
  }

  get rules(): TRule[] {
    return [...this.list];
  }

  // These rules, then the later ones: where both match, the later ones decide.
  then(later: RuleSet<TRule>): RuleSet<TRule> {
    return new RuleSet<TRule>([...this.list, ...later.list]);
  }

  // Fills `{{identity.*}}` placeholders. Built-in roles carry none, so a set without a mustache is returned as is,
  // skipping the compile, the render and the reparse.
  interpolate(context: Record<string, unknown>): RuleSet<TRule> {
    return new RuleSet<TRule>(RuleSet.render(this.list, context));
  }

  // Interpolation for stored rules read for someone other than the requester (a privilege boundary, a member
  // listing): rules that read `identity.auth` keep their mustaches.
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

  // Cuts the set down to the allowed subjects and actions (what a delegated OAuth token's scopes cover). Purely
  // subtractive: allow rules out of scope are dropped, the rest narrowed to the allowed actions with their conditions,
  // and cannot rules kept, since they only restrict.
  narrowTo(allowed: Map<string, Set<string>>): RuleSet<TRule> {
    return new RuleSet<TRule>(
      this.list.flatMap((listed) => {
        const rule = listed as TRuleLike;
        if (rule.inverted) return [listed];
        const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
        const ruleActions = Array.isArray(rule.action) ? rule.action : [rule.action];
        const grantsManage = ruleActions.includes(CASL_MANAGE_ACTION);
        return ruleSubjects.flatMap((ruleSubject) =>
          resolveTargetSubjects(ruleSubject, allowed).flatMap((subject) => {
            const allowedActions = allowed.get(subject) ?? new Set<string>();
            const actions = grantsManage
              ? [...allowedActions]
              : ruleActions.filter((action) => allowedActions.has(action));
            return actions.length ? [{ ...listed, subject, action: actions } as TRule] : [];
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
