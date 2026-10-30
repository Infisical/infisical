import type { Scope } from "../model";
import {
  ACTION_ALLOWED_CONDITIONS,
  ORG_SUBJECTS,
  type PermissionSubject,
  PROJECT_SUBJECTS
} from "./catalog";

export type Operator = "$eq" | "$neq" | "$in" | "$all" | "$glob";
export type Condition = { lhs: string; operator: Operator; rhs: string };
export type Rule = { id: string; actions: string[]; inverted: boolean; conditions: Condition[] };
export type RolePermissions = Record<string, Rule[]>;

export type RuleErrors = {
  actions?: string;
  conditions?: Record<number, { lhs?: string; rhs?: string }>;
};
export type PermissionErrors = Record<string, Record<number, RuleErrors>>;

export const subjectsFor = (scope: Scope) => (scope === "org" ? ORG_SUBJECTS : PROJECT_SUBJECTS);

export const ruleId = () => crypto.randomUUID();

export const emptyRule = (): Rule => ({
  id: ruleId(),
  actions: [],
  inverted: false,
  conditions: []
});

const rule = (actions: string[], conditions: Condition[] = [], inverted = false): Rule => ({
  id: ruleId(),
  actions,
  inverted,
  conditions
});

const every = (subjects: PermissionSubject[]): RolePermissions =>
  Object.fromEntries(
    subjects.map((subject) => [subject.subject, [rule(subject.actions.map((a) => a.value))]])
  );

const READ = /^(read|describeSecret|readValue|list-)/;
const readOnly = (subjects: PermissionSubject[], skip: string[] = []): RolePermissions =>
  Object.fromEntries(
    subjects.flatMap((subject) => {
      const actions = subject.actions
        .map((a) => a.value)
        .filter((value) => READ.test(value) && !value.includes("credential"))
        .filter((value) => !(subject.subject === "secrets" && value === "read"));
      return actions.length && !skip.includes(subject.subject)
        ? [[subject.subject, [rule(actions)]]]
        : [];
    })
  );

export const seedRolePermissions = (): Record<string, RolePermissions> => ({
  "r-admin": every(ORG_SUBJECTS),
  "r-member": {
    member: [rule(["read"])],
    role: [rule(["read"])],
    settings: [rule(["read"])],
    identity: [rule(["read"])],
    groups: [rule(["read"])],
    "app-connections": [rule(["read", "connect"])],
    project: [rule(["create"])]
  },
  "r-no-access": {},
  "r-auditor": {
    member: [rule(["read"])],
    "audit-logs": [rule(["read"])],
    identity: [rule(["read"])],
    groups: [rule(["read"])]
  },
  "r-release": {
    member: [rule(["read"])],
    identity: [rule(["read", "create", "edit"])],
    groups: [rule(["read"])],
    project: [rule(["create"])]
  },
  "p-admin": every(PROJECT_SUBJECTS),
  "p-member": {
    ...readOnly(PROJECT_SUBJECTS),
    secrets: [rule(["describeSecret", "readValue", "create", "edit", "delete"])],
    "secret-folders": [rule(["create", "edit", "delete"])],
    "secret-imports": [rule(["read", "create", "edit", "delete"])],
    tags: [rule(["read", "create", "edit", "delete"])]
  },
  "p-viewer": readOnly(PROJECT_SUBJECTS, ["audit-logs", "insights"]),
  "p-no-access": {},
  "p-deploy-reviewer": {
    secrets: [
      rule(
        ["describeSecret", "readValue"],
        [
          { lhs: "environment", operator: "$eq", rhs: "prod" },
          { lhs: "secretPath", operator: "$glob", rhs: "/api/**" }
        ]
      ),
      rule(
        ["edit"],
        [
          { lhs: "environment", operator: "$eq", rhs: "staging" },
          { lhs: "secretPath", operator: "$glob", rhs: "/api/**" }
        ]
      )
    ],
    environments: [rule(["read"])]
  },
  "p-platform-operator": {
    secrets: [
      rule(["describeSecret", "readValue", "create", "edit", "delete"]),
      rule(
        ["readValue"],
        [
          { lhs: "environment", operator: "$eq", rhs: "prod" },
          { lhs: "secretPath", operator: "$glob", rhs: "/pci/**" }
        ],
        true
      )
    ],
    "secret-folders": [
      rule(["create", "edit", "delete"], [{ lhs: "environment", operator: "$neq", rhs: "prod" }])
    ],
    "secret-imports": [rule(["read", "create"])],
    "dynamic-secrets": [
      rule(["lease"]),
      rule(["read-root-credential"], [{ lhs: "environment", operator: "$eq", rhs: "staging" }])
    ],
    environments: [rule(["read", "create", "edit"])],
    integrations: [rule(["read"])],
    "secret-syncs": [
      rule(["read", "sync-secrets"], [{ lhs: "environment", operator: "$in", rhs: "dev,staging" }])
    ],
    "secret-rotation": [rule(["read", "rotate-secrets"])],
    tags: [rule(["read", "create", "edit", "delete"])],
    webhooks: [rule(["read", "create"])],
    "service-tokens": [rule(["read"])],
    "audit-logs": [rule(["read"])],
    member: [rule(["read"])],
    commits: [rule(["read"])]
  }
});

export const PROJECT_TAGS = ["api", "billing", "pci"];

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

export const actionLabel = (scope: Scope, subject: string, action: string) =>
  subjectsFor(scope)
    .find((item) => item.subject === subject)
    ?.actions.find((item) => item.value === action)?.label ?? action;

export const validatePermissions = (
  scope: Scope,
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
        if (operator === "$neq" && rhs.includes(","))
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
  flat.map((item) => ({
    id: ruleId(),
    actions: Object.entries(item)
      .filter(([key, value]) => key !== "inverted" && key !== "conditions" && value === true)
      .map(([key]) => key),
    inverted: Boolean(item.inverted),
    conditions: (item.conditions as Condition[] | undefined) ?? []
  }));
