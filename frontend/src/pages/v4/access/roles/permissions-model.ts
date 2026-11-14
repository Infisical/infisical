import { OrgPermissionSubjects } from "@app/context/OrgPermissionContext/types";
import type { TPermission, TProjectPermission } from "@app/hooks/api/roles/types";
import {
  formRolePermission2API,
  isConditionalSubjects,
  rolePermission2Form,
  type TFormSchema
} from "@app/pages/project/RoleDetailsBySlugPage/components/ProjectRoleModifySection.utils";

import {
  ACTION_ALLOWED_CONDITIONS,
  ORG_SUBJECTS,
  type PermissionSubject,
  PROJECT_SUBJECTS
} from "./catalog";

export type RoleScope = "org" | "project";
export type Operator = "$eq" | "$ne" | "$in" | "$all" | "$glob";
export type Condition = { lhs: string; operator: Operator; rhs: string };
export type Rule = { id: string; actions: string[]; inverted: boolean; conditions: Condition[] };
export type RolePermissions = Record<string, Rule[]>;

export type RuleErrors = {
  actions?: string;
  conditions?: Record<number, { lhs?: string; rhs?: string }>;
};
export type PermissionErrors = Record<string, Record<number, RuleErrors>>;

export const subjectsFor = (scope: RoleScope): PermissionSubject[] =>
  scope === "org" ? ORG_SUBJECTS : PROJECT_SUBJECTS;

export const ruleId = () => crypto.randomUUID();

export const emptyRule = (): Rule => ({
  id: ruleId(),
  actions: [],
  inverted: false,
  conditions: []
});

export const disallowingActions = (subject: string, lhs: string, actions: readonly string[]) => {
  const map = ACTION_ALLOWED_CONDITIONS[subject];
  if (!map) return [];
  return actions.filter((action) => map[action] !== undefined && !map[action].includes(lhs));
};

export const allowedConditions = (
  subject: string,
  actions: readonly string[],
  all: readonly string[]
) => {
  const map = ACTION_ALLOWED_CONDITIONS[subject];
  const restricted = map ? actions.filter((action) => map[action] !== undefined) : [];
  if (!map || !restricted.length) return [...all];
  return restricted.reduce<string[]>(
    (acc, action) => acc.filter((value) => map[action].includes(value)),
    [...all]
  );
};

export const actionLabel = (scope: RoleScope, subject: string, action: string) =>
  subjectsFor(scope)
    .find((item) => item.subject === subject)
    ?.actions.find((item) => item.value === action)?.label ?? action;

export const validatePermissions = (
  scope: RoleScope,
  permissions: RolePermissions
): PermissionErrors => {
  const errors: PermissionErrors = {};
  const fail = (subject: string, index: number, patch: RuleErrors) => {
    errors[subject] ??= {};
    const current = errors[subject][index] ?? {};
    const conditions = { ...current.conditions };
    Object.entries(patch.conditions ?? {}).forEach(([key, value]) => {
      conditions[Number(key)] = { ...conditions[Number(key)], ...value };
    });
    errors[subject][index] = { actions: patch.actions ?? current.actions, conditions };
  };
  Object.entries(permissions).forEach(([subject, rules]) => {
    rules.forEach((item, index) => {
      if (!item.actions.length)
        fail(subject, index, { actions: "At least one action is required" });
      if (scope !== "project") return;
      const seen = new Set<string>();
      item.conditions.forEach(({ lhs, operator, rhs }, conditionIndex) => {
        const set = (field: "lhs" | "rhs", message: string) =>
          fail(subject, index, { conditions: { [conditionIndex]: { [field]: message } } });
        const blocked = disallowingActions(subject, lhs, item.actions);
        if (blocked.length)
          set(
            "lhs",
            `This condition is not available for the actions: ${blocked
              .map((action) => actionLabel(scope, subject, action))
              .join(", ")}.`
          );
        const key = `${lhs}-${operator}`;
        if (seen.has(key)) set("lhs", "Duplicate operator found for this condition");
        seen.add(key);
        if (!rhs.trim()) {
          set("rhs", "Enter a value");
          return;
        }
        if (lhs === "secretPath" && operator !== "$glob") {
          const valid =
            operator === "$in"
              ? rhs.split(",").every((value) => value.trim().startsWith("/"))
              : rhs.trim().startsWith("/");
          if (!valid) set("rhs", "Invalid secret path. Must start with '/'");
        }
        if (operator === "$eq" && rhs.includes(","))
          set(
            "rhs",
            '"Equal" checks cannot contain comma separated values. Use "In" operator instead.'
          );
        if (operator === "$ne" && rhs.includes(","))
          set(
            "rhs",
            '"Not equal" checks cannot contain comma separated values. Use "In" operator with "Forbid" instead.'
          );
      });
    });
  });
  return errors;
};

export const fromFlatRules = (flat: readonly Record<string, unknown>[]): Rule[] =>
  flat
    .map((item) => ({
      id: ruleId(),
      actions: Object.entries(item)
        .filter(([key, value]) => key !== "inverted" && key !== "conditions" && value === true)
        .map(([key]) => key),
      inverted: Boolean(item.inverted),
      conditions: ((item.conditions as Condition[] | undefined) ?? []).map((condition) => ({
        lhs: condition.lhs,
        operator: condition.operator,
        rhs: condition.rhs
      }))
    }))
    .filter((rule) => rule.actions.length > 0);

const withRules = (entries: [string, Rule[]][]): RolePermissions =>
  Object.fromEntries(entries.filter(([, rules]) => rules.length > 0));

const projectFromApi = (permissions: readonly TProjectPermission[]): RolePermissions => {
  const form = rolePermission2Form([...permissions]) as Record<
    string,
    Record<string, unknown>[] | undefined
  >;
  return withRules(
    Object.entries(form).map(([subject, rules]) => [subject, fromFlatRules(rules ?? [])])
  );
};

const orgFromApi = (permissions: readonly TPermission[]): RolePermissions => {
  const grouped = new Map<string, Set<string>>();
  permissions.forEach((permission) => {
    const subject =
      permission.subject === OrgPermissionSubjects.Workspace
        ? OrgPermissionSubjects.Project
        : permission.subject;
    const actions = grouped.get(subject) ?? new Set<string>();
    [permission.action].flat().forEach((action) => actions.add(action));
    grouped.set(subject, actions);
  });
  return withRules(
    [...grouped].map(([subject, actions]) => [
      subject,
      [{ id: ruleId(), actions: [...actions], inverted: false, conditions: [] }]
    ])
  );
};

export const permissionsFromApi = (
  scope: RoleScope,
  permissions: readonly (TPermission | TProjectPermission)[] = []
) =>
  scope === "org"
    ? orgFromApi(permissions as TPermission[])
    : projectFromApi(permissions as TProjectPermission[]);

export const projectToApi = (permissions: RolePermissions): TProjectPermission[] =>
  formRolePermission2API(
    Object.fromEntries(
      Object.entries(permissions).map(([subject, rules]) => [
        subject,
        rules.map((rule) => ({
          ...Object.fromEntries(rule.actions.map((action) => [action, true])),
          ...(isConditionalSubjects(subject as Parameters<typeof isConditionalSubjects>[0])
            ? { inverted: rule.inverted, conditions: rule.conditions }
            : {})
        }))
      ])
    ) as TFormSchema["permissions"]
  );

export const orgToApi = (permissions: RolePermissions): TPermission[] =>
  Object.entries(permissions).flatMap(([subject, rules]) =>
    [...new Set(rules.flatMap((rule) => rule.actions))].map((action) => ({ subject, action }))
  );

export const permissionsToApi = (scope: RoleScope, permissions: RolePermissions) =>
  scope === "org" ? orgToApi(permissions) : projectToApi(permissions);
