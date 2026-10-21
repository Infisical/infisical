import { logger } from "@app/lib/logger";
import { EventResultStatus } from "@app/services/event-outbox/event-outbox-types";

import { DelegatedApprovalDecisionOutcome } from "./delegated-approval-decision-enums";
import {
  TApplyDelegatedApprovalDecisionResult,
  TDecidedDelegatedApprovalReadResult,
  TDelegatedApprovalDecisionAuditMetadata,
  TDelegatedApprovalDecisionContext,
  TDelegatedApprovalFinalizeOutcome
} from "./delegated-approval-decision-types";

const PAIR_SEPARATOR = ":";

const normalizeToken = (token: string) => token.replace(/\s+/g, " ").trim().toLowerCase();

const toPairs = (line: string): string[] => {
  const separatorIndex = line.indexOf(PAIR_SEPARATOR);
  if (separatorIndex === -1) {
    const subject = normalizeToken(line);
    return subject ? [subject] : [];
  }

  const subject = normalizeToken(line.slice(0, separatorIndex));
  if (!subject) return [];

  const pairs: string[] = [];
  for (const token of line.slice(separatorIndex + 1).split(",")) {
    if (token.includes(PAIR_SEPARATOR)) {
      pairs.push(...toPairs(token));
      continue;
    }
    const action = normalizeToken(token);
    if (action) pairs.push(`${subject}${PAIR_SEPARATOR}${action}`);
  }
  return pairs.length ? pairs : [subject];
};

// Both the permissions Infisical dispatched and the ones a delegated approval system hands back go
// through this before they are compared, so padding, line endings, ordering, duplicates and case can
// never count as a change while a different subject or action always does.
export const normalizeDelegatedApprovalPermissions = (raw: string | string[] | null | undefined): string[] => {
  const text = Array.isArray(raw) ? raw.join("\n") : (raw ?? "");
  const pairs = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap(toPairs);
  return Array.from(new Set(pairs)).sort();
};

export const haveSameDelegatedApprovalPermissions = (requested: string[], approved: string[]) =>
  requested.length === approved.length && requested.every((pair, index) => pair === approved[index]);

export const describeDelegatedApprovalPermissions = (normalized: string[]) => {
  if (!normalized.length) return "none";

  const actionsBySubject = new Map<string, string[]>();
  for (const pair of normalized) {
    const separatorIndex = pair.indexOf(PAIR_SEPARATOR);
    const subject = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex);
    const action = separatorIndex === -1 ? null : pair.slice(separatorIndex + 1);
    const actions = actionsBySubject.get(subject) ?? [];
    if (action) actions.push(action);
    actionsBySubject.set(subject, actions);
  }

  return Array.from(actionsBySubject.entries())
    .map(([subject, actions]) => (actions.length ? `${subject}: ${actions.join(", ")}` : subject))
    .join("; ");
};

export const recordDelegatedApprovalDecisionOutcome = async (
  outcome: TDelegatedApprovalFinalizeOutcome,
  {
    context,
    decided,
    audit
  }: {
    context: TDelegatedApprovalDecisionContext;
    decided: TDecidedDelegatedApprovalReadResult;
    audit: (
      context: TDelegatedApprovalDecisionContext,
      metadata: TDelegatedApprovalDecisionAuditMetadata
    ) => Promise<void>;
  }
): Promise<TApplyDelegatedApprovalDecisionResult> => {
  switch (outcome.kind) {
    case "applied": {
      await audit(context, { outcome: DelegatedApprovalDecisionOutcome.Applied, decided });
      logger.info(
        `Delegated approval decision applied [delegatedRequestId=${context.delegatedRequestId}] [approvalRequestId=${context.approvalRequest.id}] [decision=${decided.decision}]`
      );
      return { status: EventResultStatus.Delivered };
    }
    case "late":
      await audit(context, { outcome: DelegatedApprovalDecisionOutcome.Failed, reason: outcome.reason, decided });
      logger.warn(
        `Delegated approval decision arrived too late [delegatedRequestId=${context.delegatedRequestId}] [approvalRequestId=${context.approvalRequest.id}] [reason=${outcome.reason}]`
      );
      return { status: EventResultStatus.Delivered };
    default:
      logger.info(
        `Delegated approval request was finalized while its decision was being read, skipping [delegatedRequestId=${context.delegatedRequestId}] [outcome=${outcome.kind}]`
      );
      return { status: EventResultStatus.Delivered };
  }
};
