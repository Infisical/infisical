import { packRules, unpackRules } from "@casl/ability/extra";
import { Knex } from "knex";

import { ProjectType, TableName } from "../schemas";

// Agent Vault session actions lose their `-any` twins. `read`, `edit` and `revoke` reached only the caller's own sessions
// and `read-any`, `edit-any` and `revoke-any` everyone's; now the three reach every session, and a condition on
// `actorId` limits a rule to the caller's own ($eq) or to everyone else's ($ne). Each Agent Vault role is rewritten to
// grant what it granted before:
// - an allowed action with its `-any` twin reaches every session, and one without it only the caller's own (a twin
//   without its action reached nothing, since every check of another's session also checked the action);
// - a denied action denied every session, and a denied twin alone only everyone else's.
// Rules for anything else are left as they are.
//
// Everything is inlined, so later changes to the app's rule builders and constants can't change what this writes.

const SESSIONS = "agent-vault-sessions";
const SELF = "{{identity.id}}";
const ACTOR_ACTIONS = ["read", "edit", "revoke"];
const ANY_SUFFIX = "-any";

type TRule = {
  action: string | string[];
  subject: string | string[];
  conditions?: Record<string, unknown>;
  inverted?: boolean;
  fields?: string | string[];
};

const listOf = (value: string | string[]) => (Array.isArray(value) ? value : [value]);

const sessionRule = (actions: string[], inverted: boolean, operator?: "$eq" | "$ne"): TRule[] =>
  actions.length
    ? [
        {
          action: actions,
          subject: SESSIONS,
          ...(operator && { conditions: { actorId: { [operator]: SELF } } }),
          ...(inverted && { inverted: true })
        }
      ]
    : [];

// Splits each rule that names sessions among other subjects, so the session part can be rewritten on its own. Null when
// the role has no session rule written the old way.
const splitSessionRules = (rules: TRule[]) => {
  const kept: TRule[] = [];
  const session: TRule[] = [];
  rules.forEach((rule) => {
    const subjects = listOf(rule.subject);
    if (!subjects.includes(SESSIONS)) {
      kept.push(rule);
      return;
    }
    const others = subjects.filter((name) => name !== SESSIONS);
    if (others.length) kept.push({ ...rule, subject: others });
    session.push({ ...rule, subject: SESSIONS });
  });
  // A session rule with conditions or fields was written after this change, so the role is already in the new form.
  if (!session.length || session.some((rule) => rule.conditions || rule.fields)) return null;
  return { kept, session };
};

const toActorConditions = (rules: TRule[]): TRule[] | null => {
  const split = splitSessionRules(rules);
  if (!split) return null;
  const allowed = new Set(split.session.filter((rule) => !rule.inverted).flatMap((rule) => listOf(rule.action)));
  const denied = new Set(split.session.filter((rule) => rule.inverted).flatMap((rule) => listOf(rule.action)));
  const isTwin = (action: string) => ACTOR_ACTIONS.some((name) => action === `${name}${ANY_SUFFIX}`);

  const allowEvery = [...allowed].filter(
    (action) => !isTwin(action) && (!ACTOR_ACTIONS.includes(action) || allowed.has(`${action}${ANY_SUFFIX}`))
  );
  const allowOwn = ACTOR_ACTIONS.filter((action) => allowed.has(action) && !allowed.has(`${action}${ANY_SUFFIX}`));
  const denyEvery = [...denied].filter((action) => !isTwin(action));
  const denyOthers = ACTOR_ACTIONS.filter((action) => denied.has(`${action}${ANY_SUFFIX}`) && !denied.has(action));

  return [
    ...split.kept,
    ...sessionRule(allowEvery, false),
    ...sessionRule(allowOwn, false, "$eq"),
    ...sessionRule(denyEvery, true),
    ...sessionRule(denyOthers, true, "$ne")
  ];
};

// The inverse, for down(): every session again, the caller's own, and everyone else's map back onto the twins.
const toTwinActions = (rules: TRule[]): TRule[] | null => {
  const kept: TRule[] = [];
  const allowed = new Set<string>();
  const denied = new Set<string>();
  let hasSessionRule = false;
  rules.forEach((rule) => {
    if (!listOf(rule.subject).includes(SESSIONS) || listOf(rule.subject).length > 1) {
      kept.push(rule);
      return;
    }
    hasSessionRule = true;
    // A bare value is $eq: the schema takes both forms.
    const actorCondition = rule.conditions?.actorId;
    const operator =
      actorCondition === SELF ? "$eq" : Object.keys((actorCondition as Record<string, string> | undefined) ?? {})[0];
    listOf(rule.action).forEach((action) => {
      const isActorAction = ACTOR_ACTIONS.includes(action);
      const target = rule.inverted ? denied : allowed;
      if (!isActorAction || operator === "$eq") target.add(action);
      else if (operator === "$ne") target.add(`${action}${ANY_SUFFIX}`);
      else if (rule.inverted) target.add(action);
      else {
        target.add(action);
        target.add(`${action}${ANY_SUFFIX}`);
      }
    });
  });
  if (!hasSessionRule) return null;
  return [...kept, ...sessionRule([...allowed], false), ...sessionRule([...denied], true)];
};

const rewriteRoles = async (knex: Knex, rewrite: (rules: TRule[]) => TRule[] | null) => {
  const roles = (await knex(TableName.Role)
    .join(TableName.Project, `${TableName.Project}.id`, `${TableName.Role}.projectId`)
    .where(`${TableName.Project}.type`, ProjectType.AgentVault)
    .whereRaw(`??::text like ?`, [`${TableName.Role}.permissions`, `%${SESSIONS}%`])
    .select(knex.ref("id").withSchema(TableName.Role), knex.ref("permissions").withSchema(TableName.Role))) as {
    id: string;
    permissions: unknown;
  }[];

  for await (const role of roles) {
    const stored = typeof role.permissions === "string" ? JSON.parse(role.permissions) : role.permissions;
    if (Array.isArray(stored)) {
      const rewritten = rewrite(unpackRules(stored as Parameters<typeof unpackRules>[0]) as TRule[]);
      if (rewritten) {
        await knex(TableName.Role)
          .where({ id: role.id })
          .update({ permissions: JSON.stringify(packRules(rewritten as Parameters<typeof packRules>[0])) });
      }
    }
  }
};

export async function up(knex: Knex): Promise<void> {
  await rewriteRoles(knex, toActorConditions);
}

export async function down(knex: Knex): Promise<void> {
  await rewriteRoles(knex, toTwinActions);
}
