import { packRules, unpackRules } from "@casl/ability/extra";
import { Knex } from "knex";

import { TableName } from "../schemas";

// Auth-method configuration (attach/update) used to reuse the generic identity
// `create`/`edit` actions. It now requires the dedicated `edit-auth` action. To
// avoid silently stripping this ability on upgrade, grandfather `edit-auth` onto
// any stored permission set that could already configure auth methods (i.e. has
// an identity rule referencing `create` or `edit`), preserving each source
// rule's conditions so identity-scoping is retained.
//
// This mirrors BOTH allow (non-inverted) and deny (inverted) source rules: a set
// that broadly allows `edit` on identities but denies it for a specific
// `identityId` must keep that exclusion for `edit-auth`, otherwise it could
// configure auth methods on an identity it was explicitly barred from editing.
// Source rules are mirrored in their original relative order, and CASL resolves
// the last matching rule as the winner, so a deny that overrode an allow before
// continues to override it for `edit-auth`.
//
// Stored CASL rules live in two tables, both keyed by `id` with a `permissions`
// column in the same packed format, so a single pass over each covers them:
//  - `roles`: both org roles (projectId IS NULL) and project custom roles.
//  - `additional_privileges`: per-actor privilege augmentations for BOTH users
//    (actorUserId) and machine identities (actorIdentityId). Permission
//    resolution reads this table's `permissions` for either actor, so an
//    additional privilege granting identity create/edit would otherwise silently
//    lose the ability to configure other identities' auth methods.
// Built-in roles (admin/member/no-access) are handled in code and are not stored,
// so they are unaffected. The legacy identity_project_additional_privilege /
// project_user_additional_privilege tables are no longer read by permission
// resolution, so they are intentionally not touched.

const PERMISSIONED_TABLES = [TableName.Role, TableName.AdditionalPrivilege] as const;

const IDENTITY_SUBJECT = "identity";
const CREATE_ACTION = "create";
const EDIT_ACTION = "edit";
const EDIT_AUTH_ACTION = "edit-auth";

type CaslRule = {
  action: string | string[];
  subject: string | string[];
  conditions?: unknown;
  inverted?: boolean;
};

// `unpackRules` normalises `subject`/`action` to array form, so accept either shape.
const includes = (value: string | string[] | undefined, target: string) =>
  value === target || (Array.isArray(value) && value.includes(target));

const conditionSignature = (conditions: unknown) =>
  conditions === undefined ? "__none__" : JSON.stringify(conditions);

// An allow and a deny with identical conditions are distinct rules, so the
// dedup key must include the inverted flag.
const ruleSignature = (rule: CaslRule) => `${rule.inverted ? "deny" : "allow"}:${conditionSignature(rule.conditions)}`;

const unpackPermissions = (permissions: unknown) =>
  unpackRules((permissions ?? []) as Parameters<typeof unpackRules>[0]) as CaslRule[];

const packPermissions = (rules: CaslRule[]) => JSON.stringify(packRules(rules as Parameters<typeof packRules>[0]));

// up(): add an `edit-auth` rule mirroring each identity create/edit rule. Returns
// null when nothing needs to change so the caller can skip the row.
const addEditAuth = (rules: CaslRule[]): CaslRule[] | null => {
  // Signatures (inverted flag + conditions) for which an edit-auth rule already
  // exists, so we don't duplicate it.
  const existingEditAuth = new Set(
    rules
      .filter((rule) => includes(rule.subject, IDENTITY_SUBJECT) && includes(rule.action, EDIT_AUTH_ACTION))
      .map(ruleSignature)
  );

  // Source rules that scoped the ability to configure auth methods, in their
  // original relative order. Both allows (grant edit-auth) and denies (exclude
  // edit-auth) are mirrored so identity-scoping is preserved.
  const sourceRules = rules.filter(
    (rule) =>
      includes(rule.subject, IDENTITY_SUBJECT) &&
      (includes(rule.action, CREATE_ACTION) || includes(rule.action, EDIT_ACTION))
  );

  const rulesToAdd: CaslRule[] = [];
  const addedSignatures = new Set<string>();
  for (const rule of sourceRules) {
    const signature = ruleSignature(rule);
    if (!existingEditAuth.has(signature) && !addedSignatures.has(signature)) {
      addedSignatures.add(signature);
      const newRule: CaslRule =
        rule.conditions === undefined
          ? { action: EDIT_AUTH_ACTION, subject: IDENTITY_SUBJECT }
          : { action: EDIT_AUTH_ACTION, subject: IDENTITY_SUBJECT, conditions: rule.conditions };
      if (rule.inverted) newRule.inverted = true;
      rulesToAdd.push(newRule);
    }
  }

  if (rulesToAdd.length === 0) return null;
  return [...rules, ...rulesToAdd];
};

// down(): strip edit-auth from identity rules (both allows and denies), mirroring
// up(). Returns null when nothing changed so the caller can skip the row.
const removeEditAuth = (rules: CaslRule[]): CaslRule[] | null => {
  let wasModified = false;
  const filteredRules = rules.reduce<CaslRule[]>((acc, rule) => {
    if (!includes(rule.subject, IDENTITY_SUBJECT) || !includes(rule.action, EDIT_AUTH_ACTION)) {
      acc.push(rule);
      return acc;
    }

    wasModified = true;
    if (Array.isArray(rule.action)) {
      const withoutEditAuth = rule.action.filter((a) => a !== EDIT_AUTH_ACTION);
      // Copy into a new rule so the original (shared) rule object is left untouched.
      if (withoutEditAuth.length > 0) acc.push({ ...rule, action: withoutEditAuth });
      return acc;
    }
    // Single action that is edit-auth, drop the rule entirely.
    return acc;
  }, []);

  if (!wasModified) return null;
  return filteredRules;
};

const transformTable = async (
  trx: Knex,
  tableName: (typeof PERMISSIONED_TABLES)[number],
  transform: (rules: CaslRule[]) => CaslRule[] | null
) => {
  const rows = await trx(tableName).select("*");

  const toUpdate = rows
    .map((row) => {
      const nextRules = transform(unpackPermissions(row.permissions));
      if (nextRules === null) return null;
      return { ...row, permissions: packPermissions(nextRules) };
    })
    .filter(Boolean) as typeof rows;

  if (toUpdate.length > 0) {
    await trx(tableName).insert(toUpdate).onConflict("id").merge();
  }
};

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    for (const tableName of PERMISSIONED_TABLES) {
      // eslint-disable-next-line no-await-in-loop
      await transformTable(trx, tableName, addEditAuth);
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    for (const tableName of PERMISSIONED_TABLES) {
      // eslint-disable-next-line no-await-in-loop
      await transformTable(trx, tableName, removeEditAuth);
    }
  });
}
