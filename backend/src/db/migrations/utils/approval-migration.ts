/* eslint-disable no-await-in-loop -- policies migrate one after another on purpose */
import crypto from "node:crypto";

import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { hasPostgresErrorCode } from "@app/lib/errors/postgres";
import { chunkArray, groupBy } from "@app/lib/fn";
import { initLogger, logger } from "@app/lib/logger";

// Shared by every migration that moves a legacy approval system onto the global approval tables. Once a
// migration using it has shipped, change it only additively: a behaviour change here rewrites what an
// already-applied migration did.

export const INSERT_CHUNK_SIZE = 500;
export const POLICY_STATEMENT_TIMEOUT_MS = 60_000;
const POLICY_LOCK_TIMEOUT_MS = 10_000;
const POLICY_BATCH_SIZE = 100;

enum ApprovalStepStatus {
  Pending = "pending",
  InProgress = "in-progress",
  Completed = "completed"
}

export enum ReviewDecision {
  Approved = "approved",
  Rejected = "rejected"
}

export type TLegacyApprovalTables = {
  legacyPolicies: TableName;
  legacyApprovers: TableName;
  legacyBypassers: TableName;
  legacyEnvironments: TableName;
  legacyReviewers: TableName;
};

export type TMigrationFailure = { code: string; message: string; requestId?: string };

export type TPolicyEnvironment = { envId: string; envSlug: string; projectId: string; orgId: string };

export type TLegacyApprover = {
  approverUserId?: string | null;
  approverGroupId?: string | null;
  sequence?: number | null;
  approvalsRequired?: number | null;
};

export type TLegacyBypasser = { bypasserUserId?: string | null; bypasserGroupId?: string | null };

export type TLegacyReview = {
  id: string;
  requestId: string;
  reviewerUserId: string;
  status: string;
  createdAt: Date;
  comment?: string | null;
};

export type TGroupMember = { groupId: string; userId: string };

export type TApprovalStep = {
  sequence: number;
  requiredApprovals: number;
  userIds: string[];
  groupIds: string[];
  eligibleUserIds: Set<string>;
};

export type TGlobalPolicyRows = {
  policy: Record<string, unknown>;
  secretEnvironments: Record<string, unknown>[];
  policySteps: Record<string, unknown>[];
  policyStepApprovers: Record<string, unknown>[];
  bypassers: Record<string, unknown>[];
};

export type TGlobalRequestRows = {
  requests: Record<string, unknown>[];
  requestSteps: Record<string, unknown>[];
  eligibleApprovers: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
};

export type TPolicyOutcome = "migrated" | "failedChecks" | "skipped";

const isId = (id: string | null | undefined): id is string => Boolean(id);

const formatFailure = ({ code, message, requestId }: TMigrationFailure) =>
  `${code}${requestId ? ` [requestId=${requestId}]` : ""}: ${message}`;

export const logFailedChecks = ({
  logPrefix,
  policyId,
  projectId,
  failures
}: {
  logPrefix: string;
  policyId: string;
  projectId?: string;
  failures: TMigrationFailure[];
}) => {
  logger.warn(
    { policyId, projectId, failures },
    `${logPrefix}: policy not migrated, it stays on the legacy approval system [policyId=${policyId}] [projectId=${projectId ?? "unknown"}] [failedChecks=${failures.length}] reasons=[${failures.map(formatFailure).join("; ")}]`
  );
};

export const readPolicyEnvironments = async (tx: Knex, tables: TLegacyApprovalTables, policyId: string) =>
  (await tx(tables.legacyEnvironments)
    .join(TableName.Environment, `${TableName.Environment}.id`, `${tables.legacyEnvironments}.envId`)
    .join(TableName.Project, `${TableName.Project}.id`, `${TableName.Environment}.projectId`)
    .where(`${tables.legacyEnvironments}.policyId`, policyId)
    .select(
      tx.ref("envId").withSchema(tables.legacyEnvironments),
      tx.ref("slug").withSchema(TableName.Environment).as("envSlug"),
      tx.ref("projectId").withSchema(TableName.Environment),
      tx.ref("orgId").withSchema(TableName.Project)
    )) as TPolicyEnvironment[];

export const readLegacyApprovers = async (tx: Knex, tables: TLegacyApprovalTables, policyId: string) =>
  (await tx(tables.legacyApprovers)
    .where({ policyId })
    .orderBy([{ column: "createdAt" }, { column: "id" }])
    .select("*")) as TLegacyApprover[];

export const readLegacyBypassers = async (tx: Knex, tables: TLegacyApprovalTables, policyId: string) =>
  (await tx(tables.legacyBypassers)
    .where({ policyId })
    .select("bypasserUserId", "bypasserGroupId")) as TLegacyBypasser[];

export const readLegacyReviews = async (
  tx: Knex,
  tables: TLegacyApprovalTables,
  requestIds: string[],
  { withComment = false, forUpdate = false }: { withComment?: boolean; forUpdate?: boolean } = {}
) => {
  if (!requestIds.length) return [] as TLegacyReview[];
  const columns = ["id", "requestId", "reviewerUserId", "status", "createdAt", ...(withComment ? ["comment"] : [])];
  return (await tx(tables.legacyReviewers)
    .whereIn("requestId", requestIds)
    .modify((qb) => {
      if (forUpdate) void qb.forUpdate();
    })
    .select(columns)) as TLegacyReview[];
};

export const readApproverGroupMembers = async (tx: Knex, approvers: TLegacyApprover[]) => {
  const groupIds = [...new Set(approvers.map((approver) => approver.approverGroupId).filter(isId))];
  if (!groupIds.length) return [] as TGroupMember[];
  return (await tx(TableName.UserGroupMembership)
    .whereIn("groupId", groupIds)
    .select("groupId", "userId")) as TGroupMember[];
};

export const readRequestIdsAlreadyOnGlobal = async (tx: Knex, requestIds: string[]) => {
  if (!requestIds.length) return [] as string[];
  return (await tx(TableName.ApprovalRequests).whereIn("id", requestIds).pluck("id")) as string[];
};

export const checkPolicyEnvironments = (environments: TPolicyEnvironment[], failures: TMigrationFailure[]) => {
  if (!environments.length) {
    failures.push({ code: "no-environments", message: "The policy is not attached to any environment" });
  }

  // this is impossible to happen, but it is a good sanity check
  const projectIds = [...new Set(environments.map((environment) => environment.projectId))];
  if (projectIds.length > 1) {
    failures.push({
      code: "environments-span-projects",
      message: `The policy's environments belong to several projects (${projectIds.join(", ")})`
    });
  }
  return { projectId: environments[0]?.projectId, orgId: environments[0]?.orgId };
};

// A legacy system without sequences normalizes every approver to { sequence: 1, approvalsRequired:
// policy.approvals } before calling, so the two sequence checks cannot fire there.
export const buildApprovalSteps = (
  {
    policy,
    approvers,
    groupMembers
  }: { policy: { approvals: number }; approvers: TLegacyApprover[]; groupMembers: TGroupMember[] },
  failures: TMigrationFailure[]
): TApprovalStep[] => {
  if (!approvers.length) {
    failures.push({
      code: "no-approvers",
      message: "The policy has no approvers, and the global approval system refuses requests on a policy without steps"
    });
  }

  const membersByGroup = groupBy(groupMembers, (member) => member.groupId);
  const approversBySequence = groupBy(approvers, (approver) => approver.sequence || 1);

  return Object.keys(approversBySequence)
    .map(Number)
    .sort((a, b) => a - b)
    .map((sequence, index) => {
      const rows = approversBySequence[sequence];
      const requiredValues = [...new Set(rows.map((row) => row.approvalsRequired ?? null))];
      if (requiredValues.length > 1) {
        failures.push({
          code: "step-approvals-disagree",
          message: `Approvers in sequence ${sequence} require different numbers of approvals (${requiredValues.map((value) => value ?? "unset").join(", ")})`
        });
      }

      const { approvalsRequired } = rows[0];
      if (index === 0 && !approvalsRequired && policy.approvals > 1) {
        failures.push({
          code: "ambiguous-required-approvals",
          message: `Sequence ${sequence} has no approvalsRequired, so the legacy approval system requires 1 approval there, while the policy is configured with ${policy.approvals} approvals`
        });
      }
      const requiredApprovals = approvalsRequired || 1;

      const userIds = [...new Set(rows.map((row) => row.approverUserId).filter(isId))];
      const groupIds = [...new Set(rows.map((row) => row.approverGroupId).filter(isId))];
      const eligibleUserIds = new Set([
        ...userIds,
        ...groupIds.flatMap((groupId) => (membersByGroup[groupId] ?? []).map((member) => member.userId))
      ]);

      if (!groupIds.length && requiredApprovals > userIds.length) {
        failures.push({
          code: "required-approvals-exceed-approvers",
          message: `Sequence ${sequence} requires ${requiredApprovals} approvals but has only ${userIds.length} user approver${userIds.length === 1 ? "" : "s"}`
        });
      }

      return { sequence, requiredApprovals, userIds, groupIds, eligibleUserIds };
    });
};

export const checkRequestsAlreadyMigrated = (requestIds: string[], failures: TMigrationFailure[]) => {
  if (requestIds.length) {
    failures.push({
      code: "request-already-migrated",
      message: `Requests ${requestIds.join(", ")} already exist on the global approval system`
    });
  }
};

export const checkReviewStatuses = (requestId: string, reviews: TLegacyReview[], failures: TMigrationFailure[]) => {
  reviews
    .filter((review) => review.status !== ReviewDecision.Approved && review.status !== ReviewDecision.Rejected)
    .forEach((review) => {
      failures.push({
        code: "unknown-review-status",
        requestId,
        message: `Review by ${review.reviewerUserId} has status '${review.status}'`
      });
    });
};

export const replayReviews = (steps: TApprovalStep[], reviews: TLegacyReview[]) => {
  const approvedCounts = steps.map(() => 0);
  const completedAt: (Date | null)[] = steps.map(() => null);
  const attributed: { review: TLegacyReview; stepIndex: number }[] = [];

  const currentIndex = () => {
    const index = steps.findIndex((step, i) => approvedCounts[i] < step.requiredApprovals);
    return index === -1 ? steps.length - 1 : index;
  };

  if (!steps.length) return { approvedCounts, completedAt, attributed, currentIndex: 0 };

  [...reviews]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id))
    .forEach((review) => {
      let stepIndex = currentIndex();
      if (review.status === ReviewDecision.Approved) {
        if (!steps[stepIndex].eligibleUserIds.has(review.reviewerUserId)) {
          const eligibleIndex = steps.findIndex((step) => step.eligibleUserIds.has(review.reviewerUserId));
          if (eligibleIndex !== -1) stepIndex = eligibleIndex;
        }
        approvedCounts[stepIndex] += 1;
        if (approvedCounts[stepIndex] === steps[stepIndex].requiredApprovals) {
          completedAt[stepIndex] = review.createdAt;
        }
      }
      attributed.push({ review, stepIndex });
    });

  return { approvedCounts, completedAt, attributed, currentIndex: currentIndex() };
};

export type TReviewReplay = ReturnType<typeof replayReviews>;

// The legacy systems list each approver once per policy, so a user named directly and through a group
// counts a single time.
const legacyPendingState = (steps: TApprovalStep[], reviews: TLegacyReview[]) => {
  const approvedBy = new Set(
    reviews.filter((review) => review.status === ReviewDecision.Approved).map((review) => review.reviewerUserId)
  );
  const counts = steps.map((step) => [...approvedBy].filter((userId) => step.eligibleUserIds.has(userId)).length);
  return { counts, presentIndex: steps.findIndex((step, i) => counts[i] < step.requiredApprovals) };
};

export const checkPendingApprovalState = (
  requestId: string,
  steps: TApprovalStep[],
  reviews: TLegacyReview[],
  replay: TReviewReplay,
  failures: TMigrationFailure[],
  { failWhenAllStepsSatisfied }: { failWhenAllStepsSatisfied: boolean }
) => {
  const fail = (message: string) => failures.push({ code: "pending-request-state-mismatch", requestId, message });

  if (!steps.length) {
    fail("skipped: the policy has no approval steps to compare against");
    return;
  }

  [...new Set(reviews.filter((r) => r.status === ReviewDecision.Approved).map((r) => r.reviewerUserId))].forEach(
    (userId) => {
      const stepsOfUser = steps.filter((step) => step.eligibleUserIds.has(userId)).map((step) => step.sequence);
      if (stepsOfUser.length > 1) {
        fail(
          `Reviewer ${userId} approved and is an approver in sequences ${stepsOfUser.join(", ")}, so which step the approval counts toward is ambiguous`
        );
      }
    }
  );

  const legacy = legacyPendingState(steps, reviews);
  if (legacy.presentIndex === -1) {
    if (failWhenAllStepsSatisfied) {
      fail("Every step already has enough approvals, yet the request is still pending");
      return;
    }
  } else if (legacy.presentIndex !== replay.currentIndex) {
    fail(
      `The legacy approval system is waiting on sequence ${steps[legacy.presentIndex].sequence}, the global approval system would wait on sequence ${steps[replay.currentIndex].sequence}`
    );
  }
  steps.forEach((step, i) => {
    if (legacy.counts[i] !== replay.approvedCounts[i]) {
      fail(
        `Sequence ${step.sequence} counts ${legacy.counts[i]} approval(s) on the legacy approval system and ${replay.approvedCounts[i]} on the global approval system`
      );
    }
  });
};

export const buildGlobalPolicyRow = ({
  policy,
  projectId,
  orgId,
  type,
  conditions,
  constraints,
  bypassForMachineIdentities
}: {
  policy: { id: string; name: string; enforcementLevel: string; createdAt: Date; updatedAt: Date };
  projectId?: string;
  orgId?: string;
  type: string;
  conditions: unknown;
  constraints: unknown;
  bypassForMachineIdentities: boolean;
}): Record<string, unknown> => ({
  id: policy.id,
  projectId,
  organizationId: orgId,
  type,
  name: policy.name,
  isActive: true,
  maxRequestTtl: null,
  conditions,
  constraints,
  enforcementLevel: policy.enforcementLevel,
  bypassForMachineIdentities,
  scopeType: null,
  scopeId: null,
  createdAt: policy.createdAt,
  updatedAt: policy.updatedAt
});

export const buildPolicyEnvironmentRows = (policyId: string, environments: TPolicyEnvironment[], secretPath: string) =>
  environments.map(({ envId }) => ({ policyId, envId, secretPath }));

export const buildPolicyStepRows = (policyId: string, steps: TApprovalStep[]) => {
  const policySteps: Record<string, unknown>[] = [];
  const policyStepApprovers: Record<string, unknown>[] = [];
  steps.forEach((step, index) => {
    const stepId = crypto.randomUUID();
    policySteps.push({ id: stepId, policyId, stepNumber: index + 1, requiredApprovals: step.requiredApprovals });
    policyStepApprovers.push(
      ...step.userIds.map((userId) => ({ policyStepId: stepId, userId, groupId: null })),
      ...step.groupIds.map((groupId) => ({ policyStepId: stepId, userId: null, groupId }))
    );
  });
  return { policySteps, policyStepApprovers };
};

export const buildBypasserRows = (policyId: string, bypassers: TLegacyBypasser[]) => [
  ...[...new Set(bypassers.map((b) => b.bypasserUserId).filter(isId))].map((userId) => ({
    policyId,
    userId,
    groupId: null
  })),
  ...[...new Set(bypassers.map((b) => b.bypasserGroupId).filter(isId))].map((groupId) => ({
    policyId,
    userId: null,
    groupId
  }))
];

// A single step with isApprovedLike false stays in progress, which is what the global secret change
// bridge writes for every request.
export const buildRequestStepRows = ({
  requestId,
  steps,
  replay,
  isApprovedLike,
  requestCreatedAt,
  fallbackCompletedAt
}: {
  requestId: string;
  steps: TApprovalStep[];
  replay: TReviewReplay;
  isApprovedLike: boolean;
  requestCreatedAt: Date;
  fallbackCompletedAt: Date;
}) => {
  const stepIds = steps.map(() => crypto.randomUUID());
  const requestSteps: Record<string, unknown>[] = [];
  const eligibleApprovers: Record<string, unknown>[] = [];
  let previousCompletedAt: Date = requestCreatedAt;

  steps.forEach((step, index) => {
    let status = ApprovalStepStatus.Pending;
    let startedAt: Date | null = null;
    let completedAt: Date | null = null;
    if (isApprovedLike || index < replay.currentIndex) {
      status = ApprovalStepStatus.Completed;
      startedAt = previousCompletedAt;
      completedAt = replay.completedAt[index] ?? fallbackCompletedAt;
      previousCompletedAt = completedAt;
    } else if (index === replay.currentIndex) {
      status = ApprovalStepStatus.InProgress;
      startedAt = previousCompletedAt;
    }
    requestSteps.push({
      id: stepIds[index],
      requestId,
      stepNumber: index + 1,
      name: null,
      status,
      requiredApprovals: step.requiredApprovals,
      notifyApprovers: false,
      startedAt,
      completedAt
    });
    eligibleApprovers.push(
      ...step.userIds.map((userId) => ({ stepId: stepIds[index], userId, groupId: null })),
      ...step.groupIds.map((groupId) => ({ stepId: stepIds[index], userId: null, groupId }))
    );
  });

  const approvals: Record<string, unknown>[] = replay.attributed.map(({ review, stepIndex }) => ({
    stepId: stepIds[stepIndex],
    approverUserId: review.reviewerUserId,
    decision: review.status,
    comment: review.comment ?? null,
    createdAt: review.createdAt
  }));

  return { requestSteps, eligibleApprovers, approvals };
};

export const insertChunked = async (tx: Knex, tableName: TableName, rows: Record<string, unknown>[]) => {
  for (const chunk of chunkArray(rows, INSERT_CHUNK_SIZE)) {
    await tx(tableName).insert(chunk as never);
  }
};

export const insertGlobalPolicyRows = async (tx: Knex, rows: TGlobalPolicyRows) => {
  await tx(TableName.ApprovalPolicies).insert(rows.policy as never);
  await insertChunked(tx, TableName.ApprovalPolicySecretEnvironment, rows.secretEnvironments);
  await insertChunked(tx, TableName.ApprovalPolicySteps, rows.policySteps);
  await insertChunked(tx, TableName.ApprovalPolicyStepApprovers, rows.policyStepApprovers);
  await insertChunked(tx, TableName.ApprovalPolicyBypassers, rows.bypassers);
};

export const insertGlobalRequestRows = async (tx: Knex, rows: TGlobalRequestRows) => {
  await insertChunked(tx, TableName.ApprovalRequests, rows.requests);
  await insertChunked(tx, TableName.ApprovalRequestSteps, rows.requestSteps);
  await insertChunked(tx, TableName.ApprovalRequestStepEligibleApprovers, rows.eligibleApprovers);
  await insertChunked(tx, TableName.ApprovalRequestApprovals, rows.approvals);
};

export const lockLegacyPolicy = async <T extends { id: string; deletedAt?: Date | null }>(
  tx: Knex,
  tables: TLegacyApprovalTables,
  policyId: string
): Promise<T | null> => {
  await tx.raw(`SET LOCAL statement_timeout = ${POLICY_STATEMENT_TIMEOUT_MS}`);
  await tx.raw(`SET LOCAL lock_timeout = ${POLICY_LOCK_TIMEOUT_MS}`);

  const policy = (await tx(tables.legacyPolicies).where({ id: policyId }).forUpdate().first()) as T | undefined;
  if (!policy || policy.deletedAt) return null;
  if (await tx(TableName.ApprovalPolicies).where({ id: policyId }).first("id")) return null;
  return policy;
};

export const runLegacyPolicyMigration = async (
  knex: Knex,
  {
    tables,
    logPrefix,
    migratePolicy
  }: {
    tables: TLegacyApprovalTables;
    logPrefix: string;
    migratePolicy: (tx: Knex, policyId: string) => Promise<TPolicyOutcome>;
  }
) => {
  initLogger();

  const counts = { migrated: 0, failedChecks: 0, skipped: 0, locked: 0, failedWithError: 0 };
  let lastId: string | undefined;

  for (;;) {
    const cursor = lastId;
    const policyIds = (await knex(tables.legacyPolicies)
      .whereNull("deletedAt")
      .whereNotExists((qb) => {
        void qb
          .select(knex.raw("1"))
          .from(TableName.ApprovalPolicies)
          .whereRaw(`"${TableName.ApprovalPolicies}"."id" = "${tables.legacyPolicies}"."id"`);
      })
      .modify((qb) => {
        if (cursor) void qb.where("id", ">", cursor);
      })
      .orderBy("id", "asc")
      .limit(POLICY_BATCH_SIZE)
      .pluck("id")) as string[];
    if (!policyIds.length) break;
    lastId = policyIds[policyIds.length - 1];

    for (const policyId of policyIds) {
      try {
        logger.info(`${logPrefix}: locking policy [policyId=${policyId}]`);
        const outcome = await knex.transaction((tx) => migratePolicy(tx, policyId));
        counts[outcome] += 1;
        if (outcome === "migrated") logger.info(`${logPrefix}: policy migrated [policyId=${policyId}]`);
      } catch (error) {
        if (hasPostgresErrorCode(error, DatabaseErrorCode.LockNotAvailable)) {
          counts.locked += 1;
          logger.warn(
            `${logPrefix}: policy not migrated, it stays on the legacy approval system [policyId=${policyId}] reasons=[locked: its rows were held by another transaction for over ${POLICY_LOCK_TIMEOUT_MS}ms]`
          );
        } else {
          counts.failedWithError += 1;
          logger.error(
            error,
            `${logPrefix}: policy not migrated, it stays on the legacy approval system [policyId=${policyId}] reasons=[unexpected error]`
          );
        }
      }
    }
  }

  logger.info(
    `${logPrefix}: migrated ${counts.migrated} policies, ${counts.failedChecks} failed checks, ${counts.locked} were locked, ${counts.failedWithError} failed with an error, ${counts.skipped} were already migrated or deleted`
  );
};
