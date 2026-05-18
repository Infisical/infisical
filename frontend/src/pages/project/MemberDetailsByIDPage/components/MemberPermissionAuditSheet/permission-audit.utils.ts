import { PackRule, unpackRules } from "@casl/ability/extra";

import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext";
import { TPermissionAuditSource } from "@app/hooks/api/projects/types";

import {
  ActionAudit,
  AuditState,
  ResolvedSource,
  ResourceAudit,
  SourceRef,
  SubjectDescriptor
} from "./permission-audit.types";

type AuditRule = {
  action: string | string[];
  subject: string | string[];
  inverted?: boolean;
  conditions?: Record<string, unknown>;
};

type LoosePackedRule = PackRule<AuditRule>;

const toArray = <T>(value: T | T[]): T[] => (Array.isArray(value) ? value : [value]);

const ruleMatches = (rule: AuditRule, action: string, subject: string): boolean => {
  const ruleActions = toArray(rule.action);
  const ruleSubjects = toArray(rule.subject);
  const actionMatches = ruleActions.includes(action) || ruleActions.includes("manage");
  const subjectMatches = ruleSubjects.includes(subject) || ruleSubjects.includes("all");
  return actionMatches && subjectMatches;
};

export const resolveSources = (sources: TPermissionAuditSource[]): ResolvedSource[] =>
  sources.map((source) => {
    const rules = unpackRules<AuditRule>((source.permissions ?? []) as LoosePackedRule[]);
    return {
      id: source.id,
      type: source.type,
      name: source.name,
      slug: source.slug,
      groupName: source.groupName,
      isTemporary: source.isTemporary,
      temporaryAccessEndTime: source.temporaryAccessEndTime,
      rules
    };
  });

const evaluateActionForSubject = (
  subject: ProjectPermissionSub,
  action: string,
  label: string,
  description: string | undefined,
  isLegacy: boolean,
  sources: ResolvedSource[]
): ActionAudit => {
  const grantedBy: SourceRef[] = [];
  const conditions: Record<string, unknown>[] = [];
  let hasUnconditionalAllow = false;
  let hasConditionalAllow = false;

  sources.forEach((source) => {
    const matchingRules = source.rules.filter((rule) => ruleMatches(rule, action, subject));
    const sourceAllowsUnconditionally = matchingRules.some(
      (r) => !r.inverted && (!r.conditions || Object.keys(r.conditions).length === 0)
    );
    const conditionalRules = matchingRules.filter(
      (r) => !r.inverted && r.conditions && Object.keys(r.conditions).length > 0
    );
    const sourceAllowsConditionally = conditionalRules.length > 0;

    conditionalRules.forEach((r) => {
      if (r.conditions) conditions.push(r.conditions);
    });

    if (sourceAllowsUnconditionally || sourceAllowsConditionally) {
      grantedBy.push({
        id: source.id,
        type: source.type,
        name: source.name,
        slug: source.slug,
        groupName: source.groupName,
        isTemporary: source.isTemporary,
        temporaryAccessEndTime: source.temporaryAccessEndTime
      });
      if (sourceAllowsUnconditionally) hasUnconditionalAllow = true;
      else hasConditionalAllow = true;
    }
  });

  let state: AuditState;
  if (hasUnconditionalAllow) {
    state = "allow";
  } else if (hasConditionalAllow) {
    state = "conditional";
  } else {
    state = "deny";
  }

  return {
    action,
    label,
    description,
    isLegacy,
    state,
    grantedBy,
    conditions
  };
};

export const evaluateResource = (
  descriptor: SubjectDescriptor,
  sources: ResolvedSource[]
): ResourceAudit => {
  const allActions: ActionAudit[] = descriptor.actions.map((a) =>
    evaluateActionForSubject(
      descriptor.subject,
      a.action,
      a.label,
      a.description,
      Boolean(a.isLegacy),
      sources
    )
  );

  // Hide legacy actions unless this user actually has them granted — keeps the
  // table focused on the modern action set while still surfacing legacy grants
  // for users who haven't migrated.
  const actions = allActions.filter((a) => !a.isLegacy || a.state !== "deny");

  const allowedCount = actions.filter((a) => a.state === "allow").length;
  const conditionalCount = actions.filter((a) => a.state === "conditional").length;

  const sourceMap = new Map<string, SourceRef>();
  actions.forEach((a) => {
    a.grantedBy.forEach((s) => {
      if (!sourceMap.has(s.id)) sourceMap.set(s.id, s);
    });
  });

  return {
    subject: descriptor.subject,
    label: descriptor.label,
    description: descriptor.description,
    actions,
    allowedCount,
    conditionalCount,
    totalCount: actions.length,
    uniqueSources: Array.from(sourceMap.values()),
    hasAnyConditions: actions.some((a) => a.conditions.length > 0)
  };
};

export const evaluateAllResources = (
  descriptors: SubjectDescriptor[],
  sources: ResolvedSource[]
): ResourceAudit[] => descriptors.map((d) => evaluateResource(d, sources));

export type ConditionEntry = {
  field: string;
  operator: string;
  value: string;
};

export const formatConditionEntries = (conditions: Record<string, unknown>): ConditionEntry[] => {
  return Object.entries(conditions).map(([field, value]) => {
    if (value && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return { field, operator: "eq", value: "" };
      const [operator, operand] = entries[0];
      const opLabel = operator.replace(/^\$/, "");
      const operandStr = Array.isArray(operand) ? operand.join(", ") : String(operand);
      return { field, operator: opLabel, value: operandStr };
    }
    return { field, operator: "eq", value: String(value) };
  });
};

export const formatCondition = (conditions: Record<string, unknown>): string[] =>
  formatConditionEntries(conditions).map((e) =>
    e.value ? `${e.field} ${e.operator} ${e.value}` : e.field
  );
