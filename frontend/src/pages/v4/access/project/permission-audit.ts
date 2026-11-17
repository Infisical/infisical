import { type PackRule, unpackRules } from "@casl/ability/extra";

import type { ProjectPermissionSub } from "@app/context/ProjectPermissionContext/types";
import type {
  ProjectType,
  TPermissionAuditSource,
  TPermissionAuditSourceType
} from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import {
  EXCLUDED_PERMISSION_SUBS,
  PROJECT_PERMISSION_OBJECT,
  ProjectTypePermissionSubjects
} from "@app/pages/project/RoleDetailsBySlugPage/components/ProjectRoleModifySection.utils";

export type AuditState = "allow" | "conditional" | "forbid";

export type SourceRef = {
  id: string;
  type: TPermissionAuditSourceType;
  name: string;
  slug?: string;
  groupName?: string;
  isTemporary: boolean;
  temporaryAccessEndTime?: string;
};

export type AuditCondition = { kind: "allow" | "forbid"; conditions: Record<string, unknown> };

export type ActionAudit = {
  action: string;
  label: string;
  description?: string;
  state: AuditState;
  grantedBy: SourceRef[];
  forbiddenBy: SourceRef[];
  conditions: AuditCondition[];
};

export type ResourceAudit = {
  subject: string;
  label: string;
  description: string;
  actions: ActionAudit[];
  grantedCount: number;
  totalCount: number;
};

type AuditRule = {
  action: string | string[];
  subject: string | string[];
  inverted?: boolean;
  conditions?: Record<string, unknown>;
};
type SourcedRule = AuditRule & { source: SourceRef };

const toArray = <T>(value: T | T[]) => (Array.isArray(value) ? value : [value]);

const matches = (rule: AuditRule, action: string, subject: string) => {
  const actions = toArray(rule.action);
  const subjects = toArray(rule.subject);
  return (
    (actions.includes(action) || actions.includes("manage")) &&
    (subjects.includes(subject) || subjects.includes("all"))
  );
};

const hasConditions = (rule: AuditRule) =>
  Boolean(rule.conditions && Object.keys(rule.conditions).length > 0);

const uniqueSources = (rules: SourcedRule[]) => [
  ...new Map(rules.map((rule) => [rule.source.id, rule.source])).values()
];

const evaluateAction = (
  subject: string,
  action: { action: string; label: string; description?: string },
  rules: SourcedRule[]
): ActionAudit => {
  const matching = rules.filter((rule) => matches(rule, action.action, subject));
  const allow = matching.filter((rule) => !rule.inverted && !hasConditions(rule));
  const conditionalAllow = matching.filter((rule) => !rule.inverted && hasConditions(rule));
  const deny = matching.filter((rule) => rule.inverted && !hasConditions(rule));
  const conditionalDeny = matching.filter((rule) => rule.inverted && hasConditions(rule));
  const base = { ...action, grantedBy: [], forbiddenBy: [], conditions: [] };

  if (deny.length) return { ...base, state: "forbid", forbiddenBy: uniqueSources(deny) };
  if (!allow.length && !conditionalAllow.length) return { ...base, state: "forbid" };

  return {
    ...base,
    state: allow.length && !conditionalDeny.length ? "allow" : "conditional",
    grantedBy: uniqueSources([...allow, ...conditionalAllow]),
    conditions: [
      ...conditionalAllow.map((rule) => ({ kind: "allow" as const, conditions: rule.conditions! })),
      ...conditionalDeny.map((rule) => ({ kind: "forbid" as const, conditions: rule.conditions! }))
    ]
  };
};

const isBuiltInRole = (source: SourceRef) =>
  (source.type === "role" || source.type === "group_role") &&
  source.slug !== ProjectMembershipRole.Custom;

export const evaluateAudit = (
  projectType: ProjectType,
  sources: readonly TPermissionAuditSource[]
): ResourceAudit[] => {
  const rules = sources.flatMap((source) => {
    const ref: SourceRef = {
      id: source.id,
      type: source.type,
      name: source.name,
      slug: source.slug,
      groupName: source.groupName,
      isTemporary: source.isTemporary,
      temporaryAccessEndTime: source.temporaryAccessEndTime
    };
    return unpackRules<AuditRule>((source.permissions ?? []) as PackRule<AuditRule>[]).map(
      (rule) => ({ ...rule, source: ref })
    );
  });
  return (Object.keys(PROJECT_PERMISSION_OBJECT) as ProjectPermissionSub[])
    .filter((subject) => !EXCLUDED_PERMISSION_SUBS.includes(subject))
    .filter((subject) => ProjectTypePermissionSubjects[projectType]?.[subject])
    .map((subject) => {
      const entry = PROJECT_PERMISSION_OBJECT[subject];
      const actions = entry.actions
        .map((item) => ({
          audit: evaluateAction(
            subject,
            { action: String(item.value), label: item.label, description: item.description },
            rules
          ),
          isLegacy: /\(legacy\)/i.test(item.label)
        }))
        .filter(
          ({ audit, isLegacy }) =>
            !isLegacy || audit.grantedBy.some((source) => !isBuiltInRole(source))
        )
        .map(({ audit }) => audit);
      return {
        subject,
        label: entry.title,
        description: entry.description,
        actions,
        grantedCount: actions.filter((item) => item.state !== "forbid").length,
        totalCount: actions.length
      };
    });
};

export const conditionText = (condition: AuditCondition) =>
  Object.entries(condition.conditions).map(([field, value]) => {
    if (value && typeof value === "object") {
      const [operator, operand] = Object.entries(value as Record<string, unknown>)[0] ?? [];
      if (!operator) return field;
      const text = Array.isArray(operand) ? operand.join(", ") : String(operand);
      return `${field} ${operator.replace(/^\$/, "")} ${text}`;
    }
    return `${field} eq ${String(value)}`;
  });

const ACCESS_LABEL: Record<AuditState, string> = {
  allow: "Allowed",
  conditional: "Conditional",
  forbid: "Forbidden"
};

export const SOURCE_LABEL: Record<TPermissionAuditSourceType, string> = {
  role: "Direct role",
  group_role: "Group-inherited role",
  additional_privilege: "Additional privilege"
};

const csvField = (value: string | undefined) => {
  if (!value) return "";
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
};

export const auditCsv = (resources: readonly ResourceAudit[]) => {
  const header = [
    "Resource",
    "Action",
    "Action Description",
    "Access",
    "Source Role",
    "Source Name",
    "Source Type",
    "Group Name",
    "Temporary",
    "Temporary Expires",
    "Conditions"
  ];
  const rows = resources.flatMap((resource) =>
    resource.actions.flatMap((audit) => {
      const conditions = audit.conditions
        .flatMap((condition) =>
          conditionText(condition).map((text) =>
            condition.kind === "forbid" ? `FORBID ${text}` : text
          )
        )
        .join("; ");
      const base = [resource.label, audit.label, audit.description, ACCESS_LABEL[audit.state]];
      const sources = [
        ...audit.grantedBy.map((source) => ({ source, role: "Grants" })),
        ...audit.forbiddenBy.map((source) => ({ source, role: "Forbids" }))
      ];
      if (!sources.length) return [[...base, "", "", "", "", "", "", conditions]];
      return sources.map(({ source, role }) => [
        ...base,
        role,
        source.name,
        SOURCE_LABEL[source.type],
        source.groupName,
        source.isTemporary ? "Yes" : "",
        source.temporaryAccessEndTime,
        conditions
      ]);
    })
  );
  return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n");
};
