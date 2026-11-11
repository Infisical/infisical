// Cuts a rule set down to an allowlist of subjects and actions: what a delegated OAuth token's scopes cover. Purely
// subtractive, and it knows no subjects: the owner of a rule schema says which subjects and actions are allowed.

// CASL wildcards: "manage" matches every action on a subject, "all" matches every subject.
const CASL_MANAGE_ACTION = "manage";
const CASL_ALL_SUBJECT = "all";

export type TCaslRuleLike = {
  action: string | string[];
  subject?: string | string[];
  inverted?: boolean;
};

// A rule on the CASL "all" subject (e.g. org/project admin) fans out to every in-scope subject;
// any other subject maps to itself only when it is in scope, otherwise to nothing.
const resolveTargetSubjects = (ruleSubject: string | undefined, allowed: Map<string, Set<string>>): string[] => {
  if (ruleSubject === CASL_ALL_SUBJECT) return [...allowed.keys()];
  if (ruleSubject && allowed.has(ruleSubject)) return [ruleSubject];
  return [];
};

// Intersects a CASL rule set with the allowed actions. This is purely
// subtractive: allow-rules are dropped if their subject is out of scope, and otherwise narrowed to
// the scope-permitted actions (conditions are preserved, so resource constraints still apply).
// Inverted ("cannot") rules are kept untouched because they only further restrict access.
export const narrowRules = <T extends TCaslRuleLike>({
  rules,
  allowed
}: {
  rules: T[];
  allowed: Map<string, Set<string>>;
}): T[] =>
  rules.flatMap((rule) => {
    if (rule.inverted) return [rule];

    const ruleSubjects = Array.isArray(rule.subject) ? rule.subject : [rule.subject];
    const ruleActions = Array.isArray(rule.action) ? rule.action : [rule.action];
    const grantsManage = ruleActions.includes(CASL_MANAGE_ACTION);

    return ruleSubjects.flatMap((ruleSubject) =>
      resolveTargetSubjects(ruleSubject, allowed).flatMap((subject) => {
        const allowedActions = allowed.get(subject) ?? new Set<string>();
        const newActions = grantsManage
          ? [...allowedActions]
          : ruleActions.filter((action) => allowedActions.has(action));
        return newActions.length ? [{ ...rule, subject, action: newActions }] : [];
      })
    );
  });
