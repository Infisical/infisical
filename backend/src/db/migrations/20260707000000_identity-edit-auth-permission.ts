import { packRules, unpackRules } from "@casl/ability/extra";
import { Knex } from "knex";

import { TableName } from "../schemas";

// Auth-method configuration (attach/update) used to reuse the generic identity
// `create`/`edit` actions. It now requires the dedicated `edit-auth` action. To
// avoid silently stripping this ability from existing custom roles on upgrade,
// grandfather `edit-auth` onto any custom role that could already configure auth
// methods (i.e. has a non-inverted identity rule granting `create` or `edit`),
// preserving that rule's conditions so identity-scoping is retained.
//
// Both org roles (projectId IS NULL) and project roles live in the `roles`
// table and use the same `identity` subject + action strings, so a single pass
// covers both. Built-in roles (admin/member/no-access) are handled in code and
// are not stored here, so they are unaffected.

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

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    const customRoles = await trx(TableName.Role).select("*");

    const toUpdate = customRoles
      .map((role) => {
        const rules = unpackRules((role.permissions ?? []) as Parameters<typeof unpackRules>[0]) as CaslRule[];

        // Condition signatures for which edit-auth is already granted (non-inverted).
        const existingEditAuth = new Set(
          rules
            .filter(
              (rule) =>
                !rule.inverted && includes(rule.subject, IDENTITY_SUBJECT) && includes(rule.action, EDIT_AUTH_ACTION)
            )
            .map((rule) => conditionSignature(rule.conditions))
        );

        // Source rules that granted the ability to configure auth methods.
        const sourceRules = rules.filter(
          (rule) =>
            !rule.inverted &&
            includes(rule.subject, IDENTITY_SUBJECT) &&
            (includes(rule.action, CREATE_ACTION) || includes(rule.action, EDIT_ACTION))
        );

        const rulesToAdd: CaslRule[] = [];
        const addedSignatures = new Set<string>();
        for (const rule of sourceRules) {
          const signature = conditionSignature(rule.conditions);
          if (!existingEditAuth.has(signature) && !addedSignatures.has(signature)) {
            addedSignatures.add(signature);
            rulesToAdd.push(
              rule.conditions === undefined
                ? { action: EDIT_AUTH_ACTION, subject: IDENTITY_SUBJECT }
                : { action: EDIT_AUTH_ACTION, subject: IDENTITY_SUBJECT, conditions: rule.conditions }
            );
          }
        }

        if (rulesToAdd.length === 0) return null;

        return {
          ...role,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore-error packRules type mismatch
          permissions: JSON.stringify(packRules([...rules, ...rulesToAdd]))
        };
      })
      .filter(Boolean) as typeof customRoles;

    if (toUpdate.length > 0) {
      await trx(TableName.Role).insert(toUpdate).onConflict("id").merge();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    const customRoles = await trx(TableName.Role).select("*");

    const toUpdate = customRoles
      .map((role) => {
        const rules = unpackRules((role.permissions ?? []) as Parameters<typeof unpackRules>[0]) as CaslRule[];

        let wasModified = false;
        const filteredRules = rules.filter((rule) => {
          if (rule.inverted || !includes(rule.subject, IDENTITY_SUBJECT) || !includes(rule.action, EDIT_AUTH_ACTION))
            return true;

          wasModified = true;
          if (Array.isArray(rule.action)) {
            const withoutEditAuth = rule.action.filter((a) => a !== EDIT_AUTH_ACTION);
            if (withoutEditAuth.length === 0) return false;
            // eslint-disable-next-line no-param-reassign
            rule.action = withoutEditAuth;
            return true;
          }
          // Single action that is edit-auth, remove the rule entirely.
          return false;
        });

        if (!wasModified) return null;

        return {
          ...role,
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore-error packRules type mismatch
          permissions: JSON.stringify(packRules(filteredRules))
        };
      })
      .filter(Boolean) as typeof customRoles;

    if (toUpdate.length > 0) {
      await trx(TableName.Role).insert(toUpdate).onConflict("id").merge();
    }
  });
}
