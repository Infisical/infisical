import { packRules, unpackRules } from "@casl/ability/extra";
import { Knex } from "knex";

import { TableName } from "../schemas";

const SOURCE_SUBJECT = "settings";
const TARGET_SUBJECT = "audit-log-streams";
const ORG_SETTINGS_ACTIONS = ["read", "create", "edit", "delete"];

// `unpackRules` normalises `subject` and `action` to array form, so accept either shape.
const includes = (value: string | string[], target: string) =>
  value === target || (Array.isArray(value) && value.includes(target));

const toArray = (value: string | string[]) => (Array.isArray(value) ? value : [value]);

const unpackRoleRules = (permissions: unknown) =>
  unpackRules((permissions ?? []) as Parameters<typeof unpackRules>[0]) as TRule[];

type TRule = {
  action: string | string[];
  subject: string | string[];
  inverted?: boolean;
};

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    const customRoles = await trx(TableName.Role).whereNull("projectId").select("*");

    const toUpdate = customRoles
      .map((role) => {
        const rules = unpackRoleRules(role.permissions);

        if (rules.some((rule) => includes(rule.subject, TARGET_SUBJECT))) return null;

        const actions = Array.from(
          new Set(
            rules
              .filter((rule) => !rule.inverted && includes(rule.subject, SOURCE_SUBJECT))
              .flatMap((rule) => toArray(rule.action))
              .filter((action) => ORG_SETTINGS_ACTIONS.includes(action))
              .map((action) => (action === "read" ? "read" : "edit"))
          )
        );
        if (!actions.length) return null;

        return {
          ...role,
          permissions: JSON.stringify(
            packRules([...rules, ...actions.map((action) => ({ action, subject: TARGET_SUBJECT }))])
          )
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
    const customRoles = await trx(TableName.Role).whereNull("projectId").select("*");

    const toUpdate = customRoles
      .map((role) => {
        const rules = unpackRoleRules(role.permissions);
        const remainingRules = rules.filter((rule) => !includes(rule.subject, TARGET_SUBJECT));
        if (remainingRules.length === rules.length) return null;

        return { ...role, permissions: JSON.stringify(packRules(remainingRules)) };
      })
      .filter(Boolean) as typeof customRoles;

    if (toUpdate.length > 0) {
      await trx(TableName.Role).insert(toUpdate).onConflict("id").merge();
    }
  });
}
