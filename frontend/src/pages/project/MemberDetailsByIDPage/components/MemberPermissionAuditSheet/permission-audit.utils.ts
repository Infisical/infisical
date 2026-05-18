import { PackRule, unpackRules } from "@casl/ability/extra";

import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext";
import { TPermissionAuditSource } from "@app/hooks/api/projects/types";

import {
  ActionAudit,
  AuditCondition,
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
  const hasConditions = (r: { conditions?: Record<string, unknown> }) =>
    Boolean(r.conditions && Object.keys(r.conditions).length > 0);

  // CASL combines rules across ALL sources into a single ability and applies
  // inverted (forbid) rules to subtract from allows, regardless of which source
  // declared them. So a forbid in one role overrides an allow in another.
  type SourcedRule = ResolvedSource["rules"][number] & { source: ResolvedSource };
  const matchingRules: SourcedRule[] = sources.flatMap((source) =>
    source.rules
      .filter((rule) => ruleMatches(rule, action, subject))
      .map((rule) => ({ ...rule, source }))
  );

  const unconditionalAllowRules = matchingRules.filter((r) => !r.inverted && !hasConditions(r));
  const conditionalAllowRules = matchingRules.filter((r) => !r.inverted && hasConditions(r));
  const unconditionalDenyRules = matchingRules.filter((r) => r.inverted && !hasConditions(r));
  const conditionalDenyRules = matchingRules.filter((r) => r.inverted && hasConditions(r));

  const toSourceRef = (source: ResolvedSource): SourceRef => ({
    id: source.id,
    type: source.type,
    name: source.name,
    slug: source.slug,
    groupName: source.groupName,
    isTemporary: source.isTemporary,
    temporaryAccessEndTime: source.temporaryAccessEndTime
  });

  const dedupeSources = (rules: SourcedRule[]): SourceRef[] => {
    const seen = new Set<string>();
    const refs: SourceRef[] = [];
    rules.forEach((r) => {
      if (seen.has(r.source.id)) return;
      seen.add(r.source.id);
      refs.push(toSourceRef(r.source));
    });
    return refs;
  };

  const baseResult = {
    action,
    label,
    description,
    isLegacy
  };

  // An unconditional forbid anywhere fully revokes the action — attribute it to
  // the source(s) that declared the inverted rule(s) so the UI can show them.
  if (unconditionalDenyRules.length > 0) {
    return {
      ...baseResult,
      state: "forbid",
      grantedBy: [],
      forbiddenBy: dedupeSources(unconditionalDenyRules),
      conditions: []
    };
  }

  if (unconditionalAllowRules.length === 0 && conditionalAllowRules.length === 0) {
    return { ...baseResult, state: "forbid", grantedBy: [], forbiddenBy: [], conditions: [] };
  }

  const conditions: AuditCondition[] = [];
  conditionalAllowRules.forEach((r) => {
    if (r.conditions) conditions.push({ kind: "allow", conditions: r.conditions });
  });
  conditionalDenyRules.forEach((r) => {
    if (r.conditions) conditions.push({ kind: "forbid", conditions: r.conditions });
  });

  const grantedBy = dedupeSources([...unconditionalAllowRules, ...conditionalAllowRules]);

  let state: AuditState;
  if (unconditionalAllowRules.length > 0 && conditionalDenyRules.length === 0) {
    state = "allow";
  } else {
    state = "conditional";
  }

  return { ...baseResult, state, grantedBy, forbiddenBy: [], conditions };
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
  const actions = allActions.filter((a) => !a.isLegacy || a.state !== "forbid");

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
  kind: "allow" | "forbid";
  field: string;
  operator: string;
  value: string;
};

export const formatConditionEntries = (condition: AuditCondition): ConditionEntry[] => {
  return Object.entries(condition.conditions).map(([field, value]) => {
    if (value && typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) return { kind: condition.kind, field, operator: "eq", value: "" };
      const [operator, operand] = entries[0];
      const opLabel = operator.replace(/^\$/, "");
      const operandStr = Array.isArray(operand) ? operand.join(", ") : String(operand);
      return { kind: condition.kind, field, operator: opLabel, value: operandStr };
    }
    return { kind: condition.kind, field, operator: "eq", value: String(value) };
  });
};

export const formatCondition = (condition: AuditCondition): string[] =>
  formatConditionEntries(condition).map((e) =>
    e.value ? `${e.field} ${e.operator} ${e.value}` : e.field
  );
