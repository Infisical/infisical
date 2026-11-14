import { logger } from "@app/lib/logger";
import { TAiJudgeResult } from "@app/services/ai/ai-types";

import {
  AUTO_APPROVAL_AI_CONSTRAINT_LABEL,
  AUTO_APPROVAL_AI_SUBJECT,
  AUTO_APPROVAL_AI_SUBJECT_LABEL,
  AUTO_APPROVAL_REQUESTER_SUBJECT,
  AUTO_APPROVAL_UNUSED_CONSTRAINT,
  AUTO_APPROVAL_UNUSED_CONSTRAINT_LABEL,
  TAutoApprovalContext,
  TAutoApprovalEvidence,
  TAutoApprovalOutcome,
  TAutoApprovalSubject,
  TStoredAutoApproval
} from "./auto-approval-types";

export const getAutoApprovalSubjectKey = (condition: { inputId: string | null; connectionId: string | null }) =>
  condition.inputId ?? `${AUTO_APPROVAL_REQUESTER_SUBJECT}:${condition.connectionId}`;

export const isAiCondition = (condition: { subject: string }) => condition.subject === AUTO_APPROVAL_AI_SUBJECT;

export type TAiConditionResult = { passed: boolean; reason: string | null; ai: TAiJudgeResult | null };

export const describeAutoApprovalCondition = (subjectLabel: string, constraintLabel: string, values: string[]) =>
  [subjectLabel, constraintLabel, values.join(" or ")].filter(Boolean).join(" ");

export type TResolvedAutoApprovalSubject = {
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  definition: TAutoApprovalSubject<any, any> | null;
  facts: unknown;
  error: string | null;
  recordId?: string | null;
  stableId?: string | null;
  previouslyUsed?: boolean;
};

// Every condition in a rule must pass and the first passing rule approves
export const evaluateAutoApprovalRules = (
  rules: TStoredAutoApproval["rules"],
  subjects: Map<string, TResolvedAutoApprovalSubject>,
  ctx: TAutoApprovalContext,
  aiResults: Map<string, TAiConditionResult> = new Map()
): Pick<TAutoApprovalEvidence, "rules" | "approvedByRuleId"> => {
  const evaluated = rules.map((rule) => {
    const conditions = rule.conditions.map((condition) => {
      if (isAiCondition(condition)) {
        const result = aiResults.get(condition.id);
        return {
          id: condition.id,
          connectionId: null,
          subject: condition.subject,
          constraint: condition.constraint,
          values: condition.values,
          description: describeAutoApprovalCondition(
            AUTO_APPROVAL_AI_SUBJECT_LABEL,
            AUTO_APPROVAL_AI_CONSTRAINT_LABEL,
            []
          ),
          passed: result?.passed ?? false,
          reason: result ? result.reason : "The AI didn't review this request",
          ai: result?.ai ?? null
        };
      }

      const subject = subjects.get(getAutoApprovalSubjectKey(condition));
      const isUnusedCheck =
        condition.constraint === AUTO_APPROVAL_UNUSED_CONSTRAINT && Boolean(subject?.definition?.input);
      const constraint = isUnusedCheck ? undefined : subject?.definition?.constraints[condition.constraint];
      const base = {
        id: condition.id,
        connectionId: condition.connectionId ?? null,
        subject: condition.subject,
        constraint: condition.constraint,
        values: condition.values,
        description: describeAutoApprovalCondition(
          subject?.label ?? condition.subject,
          isUnusedCheck ? AUTO_APPROVAL_UNUSED_CONSTRAINT_LABEL : (constraint?.label ?? condition.constraint),
          condition.values
        )
      };

      if (!subject || (!constraint && !isUnusedCheck)) {
        return { ...base, passed: false, reason: "This check is no longer available" };
      }
      if (subject.error) return { ...base, passed: false, reason: subject.error };
      if (!constraint) {
        return subject.previouslyUsed
          ? {
              ...base,
              passed: false,
              reason: `${subject.label} ${subject.recordId} was already used for another request`
            }
          : { ...base, passed: true, reason: null };
      }

      try {
        const result = constraint.test(subject.facts, condition.values, ctx);
        return { ...base, passed: result.pass, reason: result.pass ? null : (result.reason ?? "Condition not met") };
      } catch (error) {
        logger.error(error, `Auto-approval condition test failed [conditionId=${condition.id}]`);
        return { ...base, passed: false, reason: "Couldn't evaluate this condition" };
      }
    });

    return {
      id: rule.id,
      name: rule.name,
      passed: conditions.length > 0 && conditions.every((condition) => condition.passed),
      conditions
    };
  });

  return { rules: evaluated, approvedByRuleId: evaluated.find((rule) => rule.passed)?.id ?? null };
};

const isAutoApprovalEvidence = (value: unknown): value is TAutoApprovalEvidence =>
  Boolean(value) &&
  typeof value === "object" &&
  (value as { version?: unknown }).version === 1 &&
  Array.isArray((value as { rules?: unknown }).rules);

// The requester isn't told why the AI declined, so they can't tune their input against it
const getVisibleReason = (condition: { subject: string; passed: boolean; reason: string | null }, hideAi: boolean) =>
  hideAi && isAiCondition(condition) && !condition.passed ? null : condition.reason;

// What the API returns about an evaluation: results and reasons
export const toAutoApprovalOutcome = (
  request: {
    autoApprovedAt?: Date | null;
    autoApprovalEvidence?: unknown;
  },
  { hideAi = false }: { hideAi?: boolean } = {}
): TAutoApprovalOutcome | null => {
  const evidence = request.autoApprovalEvidence;
  if (!isAutoApprovalEvidence(evidence)) return null;

  return {
    approvedAt: request.autoApprovedAt ?? null,
    approvedByRuleId: evidence.approvedByRuleId,
    inputs: (evidence.inputs ?? []).map(({ label, id, url }) => ({ label, value: id, url })),
    rules: evidence.rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      passed: rule.passed,
      conditions: rule.conditions.map(({ id, subject, description, passed, reason, ai }) => ({
        id,
        description,
        passed,
        reason: getVisibleReason({ subject, passed, reason }, hideAi),
        ai:
          ai && !hideAi
            ? {
                model: ai.model,
                approve: ai.approve,
                reason: ai.reason,
                error: ai.error,
                toolCalls: ai.toolCalls.map(({ tool, connectionName, input, summary, error }) => ({
                  tool,
                  connectionName,
                  input,
                  summary,
                  error
                }))
              }
            : null
      }))
    }))
  };
};

// The approving rule and what it checked, for audit logs and notifications
export const getAutoApprovalSummary = (evidence: unknown) => {
  if (!isAutoApprovalEvidence(evidence)) return null;

  const rule = evidence.rules.find((candidate) => candidate.id === evidence.approvedByRuleId);
  return {
    ruleId: evidence.approvedByRuleId,
    ruleName: rule?.name,
    linkedRecords: (evidence.inputs ?? []).map(({ label, id }) => ({ label, value: id })),
    conditions: (rule?.conditions ?? []).map((condition) => condition.description)
  };
};

// The rule that came closest to passing best explains a refusal: fewest failed conditions, then most passed
export const getClosestFailedRule = (evidence: Pick<TAutoApprovalEvidence, "rules">) => {
  const [closest] = evidence.rules
    .filter((rule) => !rule.passed)
    .map((rule) => ({
      rule,
      failed: rule.conditions.filter((condition) => !condition.passed).length,
      passed: rule.conditions.filter((condition) => condition.passed).length
    }))
    .sort((a, b) => a.failed - b.failed || b.passed - a.passed);
  if (!closest) return null;

  const failedCondition = closest.rule.conditions.find((condition) => !condition.passed);
  return {
    ruleName: closest.rule.name,
    reason:
      failedCondition && isAiCondition(failedCondition)
        ? null
        : (failedCondition?.reason ?? failedCondition?.description ?? "a condition didn't pass")
  };
};
