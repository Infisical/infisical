import { packRules, unpackRules } from "@casl/ability/extra";
import { Knex } from "knex";

import { TableName } from "../schemas";

const LDAP_SUBJECT = "ldap";
const EDIT_ACTION = "edit";
const DELETE_ACTION = "delete";

type TRawRule = {
  action: string | string[];
  subject: string | string[];
  inverted?: boolean;
};

// `unpackRules` normalises `subject` and `action` to array form, so accept either shape.
const includes = (value: string | string[] | undefined, target: string) =>
  value === target || (Array.isArray(value) && value.includes(target));

// Deleting the LDAP config used to be a PATCH that only needed `edit` on `ldap`. It now needs `delete`,
// so every rule set that could edit LDAP gets `delete` too
const withLdapDelete = (permissions: unknown) => {
  const rules = unpackRules((permissions ?? []) as Parameters<typeof unpackRules>[0]) as TRawRule[];

  const canEditLdap = rules.some(
    (rule) => !rule.inverted && includes(rule.subject, LDAP_SUBJECT) && includes(rule.action, EDIT_ACTION)
  );
  if (!canEditLdap) return null;

  // An inverted or existing `delete` kept as is.
  const hasDeleteRule = rules.some(
    (rule) => includes(rule.subject, LDAP_SUBJECT) && includes(rule.action, DELETE_ACTION)
  );
  if (hasDeleteRule) return null;

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore-error packRules type mismatch
  return JSON.stringify(packRules([...rules, { action: DELETE_ACTION, subject: LDAP_SUBJECT }]));
};

export async function up(knex: Knex): Promise<void> {
  const orgRoles = await knex(TableName.Role).whereNotNull("orgId").select("*");
  const rolesToUpdate = orgRoles
    .map((role) => {
      const permissions = withLdapDelete(role.permissions);
      return permissions ? { ...role, permissions } : null;
    })
    .filter(Boolean) as typeof orgRoles;

  if (rolesToUpdate.length > 0) {
    await knex(TableName.Role).insert(rolesToUpdate).onConflict("id").merge();
  }
}

// Backfilled `delete` rules cannot be told apart from ones an admin granted, so removing them would
// strip access that was given on purpose.
export async function down(): Promise<void> {}
