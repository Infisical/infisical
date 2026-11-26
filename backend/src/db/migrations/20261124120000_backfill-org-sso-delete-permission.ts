import { packRules, unpackRules } from "@casl/ability/extra";
import { Knex } from "knex";

import { TableName } from "../schemas";

const SSO_SUBJECT = "sso";
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

// Deleting the OIDC config used to be a PATCH that only needed `edit` on `sso`. It now needs `delete`,
// so every rule set that could edit SSO gets `delete` too
const withSsoDelete = (permissions: unknown) => {
  const rules = unpackRules((permissions ?? []) as Parameters<typeof unpackRules>[0]) as TRawRule[];

  const canEditSso = rules.some(
    (rule) => !rule.inverted && includes(rule.subject, SSO_SUBJECT) && includes(rule.action, EDIT_ACTION)
  );
  if (!canEditSso) return null;

  // An inverted or existing `delete` kept as is.
  const hasDeleteRule = rules.some(
    (rule) => includes(rule.subject, SSO_SUBJECT) && includes(rule.action, DELETE_ACTION)
  );
  if (hasDeleteRule) return null;

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore-error packRules type mismatch
  return JSON.stringify(packRules([...rules, { action: DELETE_ACTION, subject: SSO_SUBJECT }]));
};

export async function up(knex: Knex): Promise<void> {
  const orgRoles = await knex(TableName.Role).whereNotNull("orgId").select("*");
  const rolesToUpdate = orgRoles
    .map((role) => {
      const permissions = withSsoDelete(role.permissions);
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
