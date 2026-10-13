/* eslint-disable no-await-in-loop -- policies migrate one after another on purpose */
import crypto from "node:crypto";

import { Knex } from "knex";

import { verifyRequestedPermissions } from "@app/ee/services/access-approval-request/access-approval-request-fns";
import { isGlobSubsetOfGlob } from "@app/lib/casl/glob-subset";
import { chunkArray } from "@app/lib/fn";
import { ms } from "@app/lib/ms";

import { TableName } from "../schemas";
import {
  buildApprovalSteps,
  buildBypasserRows,
  buildGlobalPolicyRow,
  buildPolicyEnvironmentRows,
  buildPolicyStepRows,
  buildRequestStepRows,
  checkPendingApprovalState,
  checkPolicyEnvironments,
  checkRequestsAlreadyMigrated,
  checkReviewStatuses,
  INSERT_CHUNK_SIZE,
  insertChunked,
  insertGlobalPolicyRows,
  insertGlobalRequestRows,
  lockLegacyPolicy,
  logFailedChecks,
  POLICY_STATEMENT_TIMEOUT_MS,
  readApproverGroupMembers,
  readLegacyApprovers,
  readLegacyBypassers,
  readLegacyReviews,
  readPolicyEnvironments,
  readRequestIdsAlreadyOnGlobal,
  replayReviews,
  ReviewDecision,
  runLegacyPolicyMigration,
  TGlobalPolicyRows,
  TGlobalRequestRows,
  TGroupMember,
  TLegacyApprovalTables,
  TLegacyApprover,
  TLegacyBypasser,
  TLegacyReview,
  TMigrationFailure,
  TPolicyEnvironment,
  TPolicyOutcome
} from "./utils/approval-migration";

const LOG_PREFIX = "migrate-access-approval-policies-to-global";
const SECRET_ACCESS = "secret-access";
const SOFT_ENFORCEMENT = "soft";

const LEGACY_TABLES: TLegacyApprovalTables = {
  legacyPolicies: TableName.AccessApprovalPolicy,
  legacyApprovers: TableName.AccessApprovalPolicyApprover,
  legacyBypassers: TableName.AccessApprovalPolicyBypasser,
  legacyEnvironments: TableName.AccessApprovalPolicyEnvironment,
  legacyRequests: TableName.AccessApprovalRequest,
  legacyReviewers: TableName.AccessApprovalRequestReviewer
};

enum LegacyRequestStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
  Revoked = "revoked"
}

enum RequestStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
  Expired = "expired"
}

enum GrantStatus {
  Active = "active",
  Expired = "expired",
  Revoked = "revoked"
}

type TLegacyPolicy = {
  id: string;
  name: string;
  approvals: number;
  secretPath: string;
  enforcementLevel: string;
  allowedSelfApprovals: boolean;
  maxTimePeriod?: string | null;
  requestExpirationTime?: string | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type TLegacyRequest = {
  id: string;
  requestedByUserId: string;
  status: string;
  permissions: unknown;
  isTemporary: boolean;
  temporaryRange?: string | null;
  note?: string | null;
  privilegeId?: string | null;
  privilegeDeletedAt?: Date | null;
  expiresAt?: Date | null;
  approvedAt?: Date | null;
  revokedAt?: Date | null;
  revokedByUserId?: string | null;
  bypassReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type TAdditionalPrivilege = {
  id: string;
  actorUserId?: string | null;
  projectId?: string | null;
  permissions?: unknown;
  isTemporary: boolean;
  temporaryAccessEndTime?: Date | null;
  grantId?: string | null;
};

type TRequester = {
  id: string;
  username: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type TPolicyData = {
  policy: TLegacyPolicy;
  environments: TPolicyEnvironment[];
  approvers: TLegacyApprover[];
  bypassers: TLegacyBypasser[];
  requests: TLegacyRequest[];
  reviews: TLegacyReview[];
  additionalPrivileges: TAdditionalPrivilege[];
  requesters: TRequester[];
  groupMembers: TGroupMember[];
  requestIdsAlreadyOnGlobal: string[];
};

type TRequestData = { permissions: unknown; isTemporary: boolean; temporaryRange: string | null };

type TGlobalRows = TGlobalPolicyRows &
  TGlobalRequestRows & {
    grants: Record<string, unknown>[];
    additionalPrivilegeGrants: { additionalPrivilegeId: string; grantId: string }[];
  };

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])])
    );
  }
  return value;
};

const isSameJson = (a: unknown, b: unknown) => JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));

const durationMs = (range?: string | null) => {
  if (!range) return null;
  try {
    const value = ms(range);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

const isPast = (date: Date | null | undefined, now: Date) => Boolean(date && new Date(date).getTime() <= now.getTime());

const toRequestStatus = (
  status: string,
  { isApprovedLike, isPendingLive }: { isApprovedLike: boolean; isPendingLive: boolean }
): RequestStatus => {
  if (isApprovedLike) return RequestStatus.Approved;
  if (status === LegacyRequestStatus.Rejected) return RequestStatus.Rejected;
  return isPendingLive ? RequestStatus.Pending : RequestStatus.Expired;
};

const checkPendingScope = (
  request: TLegacyRequest,
  { policy, environments }: Pick<TPolicyData, "policy" | "environments">,
  failures: TMigrationFailure[]
) => {
  const fail = (message: string) =>
    failures.push({ code: "pending-request-out-of-scope", requestId: request.id, message });

  let requested: { envSlug: string; secretPath: string };
  try {
    requested = verifyRequestedPermissions({ permissions: request.permissions });
  } catch (error) {
    fail(`The requested permissions are invalid: ${(error as Error).message}`);
    return;
  }

  if (!environments.some((environment) => environment.envSlug === requested.envSlug)) {
    fail(`The request is for environment '${requested.envSlug}', which the policy does not cover`);
  }
  if (!isGlobSubsetOfGlob(policy.secretPath, requested.secretPath)) {
    fail(
      `The request is for secret path '${requested.secretPath}', which policy path '${policy.secretPath}' does not cover`
    );
  }
};

// The legacy system treats any approval the requester gives on a soft policy as break-glass, and the
// reason is optional, so bypassReason alone under-reports it.
const isBreakGlassApproval = (policy: TLegacyPolicy, request: TLegacyRequest, reviews: TLegacyReview[]) =>
  Boolean(request.bypassReason) ||
  (policy.enforcementLevel === SOFT_ENFORCEMENT &&
    reviews.some(
      (review) => review.status === ReviewDecision.Approved && review.reviewerUserId === request.requestedByUserId
    ));

const checkAdditionalPrivilegeState = (
  request: TLegacyRequest,
  {
    additionalPrivilege,
    projectId,
    requestsByAdditionalPrivilegeId
  }: {
    additionalPrivilege?: TAdditionalPrivilege;
    projectId?: string;
    requestsByAdditionalPrivilegeId: Map<string, string[]>;
  },
  failures: TMigrationFailure[]
) => {
  if (!request.privilegeId) return;
  const fail = (message: string) => failures.push({ code: "privilege-state-mismatch", requestId: request.id, message });

  if (request.status !== LegacyRequestStatus.Approved) {
    fail(`A ${request.status} request still points to additional privilege ${request.privilegeId}`);
  }

  const sharedWith = (requestsByAdditionalPrivilegeId.get(request.privilegeId) ?? []).filter((id) => id !== request.id);
  if (sharedWith.length) {
    fail(`Additional privilege ${request.privilegeId} is shared with requests ${sharedWith.join(", ")}`);
  }

  if (!additionalPrivilege) {
    fail(`Additional privilege ${request.privilegeId} does not exist`);
    return;
  }
  if (additionalPrivilege.actorUserId !== request.requestedByUserId || additionalPrivilege.projectId !== projectId) {
    fail(`Additional privilege ${additionalPrivilege.id} belongs to another user or project`);
  }
  if (additionalPrivilege.grantId) {
    fail(`Additional privilege ${additionalPrivilege.id} is already linked to grant ${additionalPrivilege.grantId}`);
  }
  if (!isSameJson(additionalPrivilege.permissions, request.permissions)) {
    failures.push({
      code: "privilege-permissions-mismatch",
      requestId: request.id,
      message: `Additional privilege ${additionalPrivilege.id} grants different permissions than the request asked for`
    });
  }
};

export const translatePolicy = (data: TPolicyData, now: Date) => {
  const { policy, environments, bypassers, requests, reviews, additionalPrivileges, requesters } = data;
  const failures: TMigrationFailure[] = [];

  const { projectId, orgId } = checkPolicyEnvironments(environments, failures);
  const steps = buildApprovalSteps(data, failures);

  const rows: TGlobalRows = {
    policy: buildGlobalPolicyRow({
      policy,
      projectId,
      orgId,
      type: SECRET_ACCESS,
      conditions: { version: 1, conditions: {} },
      constraints: {
        version: 1,
        constraints: {
          allowedSelfApprovals: policy.allowedSelfApprovals,
          requestExpirationTime: policy.requestExpirationTime ?? null,
          maxTimePeriod: policy.maxTimePeriod ?? null
        }
      },
      bypassForMachineIdentities: false // always false for access approval policies
    }),
    secretEnvironments: buildPolicyEnvironmentRows(policy.id, environments, policy.secretPath),
    ...buildPolicyStepRows(policy.id, steps),
    bypassers: buildBypasserRows(policy.id, bypassers),
    requests: [],
    requestSteps: [],
    eligibleApprovers: [],
    approvals: [],
    grants: [],
    additionalPrivilegeGrants: []
  };

  checkRequestsAlreadyMigrated(data.requestIdsAlreadyOnGlobal, failures);

  const requesterById = new Map(requesters.map((requester) => [requester.id, requester]));
  const additionalPrivilegeById = new Map(
    additionalPrivileges.map((additionalPrivilege) => [additionalPrivilege.id, additionalPrivilege])
  );
  const reviewsByRequestId = new Map<string, TLegacyReview[]>();
  reviews.forEach((review) => {
    reviewsByRequestId.set(review.requestId, [...(reviewsByRequestId.get(review.requestId) ?? []), review]);
  });
  const requestsByAdditionalPrivilegeId = new Map<string, string[]>();
  requests.forEach(({ id, privilegeId }) => {
    if (privilegeId)
      requestsByAdditionalPrivilegeId.set(privilegeId, [
        ...(requestsByAdditionalPrivilegeId.get(privilegeId) ?? []),
        id
      ]);
  });

  requests.forEach((request) => {
    const requestReviews = reviewsByRequestId.get(request.id) ?? [];

    const knownStatuses = Object.values(LegacyRequestStatus) as string[];
    if (!knownStatuses.includes(request.status)) {
      failures.push({
        code: "unknown-request-status",
        requestId: request.id,
        message: `Status '${request.status}' has no equivalent on the global approval system`
      });
    }
    checkReviewStatuses(request.id, requestReviews, failures);

    const requester = requesterById.get(request.requestedByUserId);
    if (!requester) {
      failures.push({
        code: "requester-missing",
        requestId: request.id,
        message: `Requester ${request.requestedByUserId} no longer exists`
      });
    }

    const isApprovedLike =
      request.status === LegacyRequestStatus.Approved || request.status === LegacyRequestStatus.Revoked;
    const additionalPrivilege = request.privilegeId ? additionalPrivilegeById.get(request.privilegeId) : undefined;
    checkAdditionalPrivilegeState(
      request,
      { additionalPrivilege, projectId, requestsByAdditionalPrivilegeId },
      failures
    );

    const replay = replayReviews(steps, requestReviews);
    const isPendingLive = request.status === LegacyRequestStatus.Pending && !isPast(request.expiresAt, now);
    if (isPendingLive) {
      checkPendingScope(request, data, failures);
      checkPendingApprovalState(request.id, steps, requestReviews, replay, failures, {
        failWhenAllStepsSatisfied: true
      });
    }

    const requestData: TRequestData = {
      permissions: request.permissions,
      isTemporary: request.isTemporary,
      temporaryRange: request.temporaryRange || null
    };

    rows.requests.push({
      id: request.id,
      projectId,
      organizationId: orgId,
      policyId: policy.id,
      requesterId: request.requestedByUserId,
      requesterName: `${requester?.firstName ?? ""} ${requester?.lastName ?? ""}`.trim() || (requester?.username ?? ""),
      requesterEmail: requester?.email || (requester?.username ?? ""),
      type: SECRET_ACCESS,
      status: toRequestStatus(request.status, { isApprovedLike, isPendingLive }),
      justification: request.note ?? null,
      currentStep: isApprovedLike ? Math.max(steps.length, 1) : replay.currentIndex + 1,
      requestData: { version: 1, requestData },
      expiresAt: request.expiresAt ?? null,
      machineIdentityId: null,
      scopeType: null,
      scopeId: null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt
    });

    const { requestSteps, eligibleApprovers, approvals } = buildRequestStepRows({
      requestId: request.id,
      steps,
      replay,
      isApprovedLike,
      requestCreatedAt: request.createdAt,
      fallbackCompletedAt: request.approvedAt ?? request.updatedAt
    });
    rows.requestSteps.push(...requestSteps);
    rows.eligibleApprovers.push(...eligibleApprovers);
    rows.approvals.push(...approvals);

    if (!isApprovedLike) return;

    const rangeMs = durationMs(request.temporaryRange);
    const windowEnd =
      rangeMs !== null && request.approvedAt ? new Date(new Date(request.approvedAt).getTime() + rangeMs) : null;
    const grantId = crypto.randomUUID();
    const grant = {
      id: grantId,
      projectId,
      requestId: request.id,
      granteeUserId: request.requestedByUserId,
      type: SECRET_ACCESS,
      attributes: requestData,
      createdAt: request.approvedAt ?? request.updatedAt,
      isBreakGlass: isBreakGlassApproval(policy, request, requestReviews),
      bypassReason: request.bypassReason ?? null,
      revokedAt: null as Date | null,
      revokedByUserId: null as string | null
    };

    if (request.status === LegacyRequestStatus.Revoked) {
      rows.grants.push({
        ...grant,
        status: GrantStatus.Revoked,
        expiresAt: windowEnd,
        revokedAt: request.revokedAt ?? request.updatedAt,
        revokedByUserId: request.revokedByUserId ?? null
      });
    } else if (additionalPrivilege) {
      const expiresAt = additionalPrivilege.isTemporary ? (additionalPrivilege.temporaryAccessEndTime ?? null) : null;
      rows.grants.push({
        ...grant,
        status: isPast(expiresAt, now) ? GrantStatus.Expired : GrantStatus.Active,
        expiresAt
      });
      rows.additionalPrivilegeGrants.push({ additionalPrivilegeId: additionalPrivilege.id, grantId });
    } else {
      rows.grants.push({
        ...grant,
        status: GrantStatus.Expired,
        expiresAt: windowEnd ?? request.privilegeDeletedAt ?? request.updatedAt
      });
    }
  });

  return { failures, rows, projectId };
};

const linkAdditionalPrivilegesToGrants = async (tx: Knex, pairs: TGlobalRows["additionalPrivilegeGrants"]) => {
  for (const chunk of chunkArray(pairs, INSERT_CHUNK_SIZE)) {
    const values = chunk.map(() => "(?::uuid, ?::uuid)").join(", ");
    await tx.raw(
      `UPDATE ${TableName.AdditionalPrivilege} AS ap
       SET "grantId" = m.grant_id
       FROM (VALUES ${values}) AS m(additional_privilege_id, grant_id)
       WHERE ap.id = m.additional_privilege_id`,
      chunk.flatMap(({ additionalPrivilegeId, grantId }) => [additionalPrivilegeId, grantId])
    );
  }
};

const readPolicyData = async (tx: Knex, policy: TLegacyPolicy, requests: TLegacyRequest[]): Promise<TPolicyData> => {
  const { id: policyId } = policy;

  const additionalPrivileges = (await tx(TableName.AdditionalPrivilege)
    .join(
      TableName.AccessApprovalRequest,
      `${TableName.AccessApprovalRequest}.privilegeId`,
      `${TableName.AdditionalPrivilege}.id`
    )
    .where(`${TableName.AccessApprovalRequest}.policyId`, policyId)
    .forUpdate(TableName.AdditionalPrivilege)
    .select(
      tx.ref("id").withSchema(TableName.AdditionalPrivilege),
      tx.ref("actorUserId").withSchema(TableName.AdditionalPrivilege),
      tx.ref("projectId").withSchema(TableName.AdditionalPrivilege),
      tx.ref("permissions").withSchema(TableName.AdditionalPrivilege),
      tx.ref("isTemporary").withSchema(TableName.AdditionalPrivilege),
      tx.ref("temporaryAccessEndTime").withSchema(TableName.AdditionalPrivilege),
      tx.ref("grantId").withSchema(TableName.AdditionalPrivilege)
    )) as TAdditionalPrivilege[];

  const environments = await readPolicyEnvironments(tx, LEGACY_TABLES, policyId);
  const approvers = await readLegacyApprovers(tx, LEGACY_TABLES, policyId);
  const bypassers = await readLegacyBypassers(tx, LEGACY_TABLES, policyId);
  const reviews = await readLegacyReviews(tx, LEGACY_TABLES, policyId);

  const requesters = (await tx(TableName.Users)
    .whereIn("id", tx(TableName.AccessApprovalRequest).where({ policyId }).select("requestedByUserId"))
    .select("id", "username", "email", "firstName", "lastName")) as TRequester[];

  const groupMembers = await readApproverGroupMembers(tx, approvers);
  const requestIdsAlreadyOnGlobal = await readRequestIdsAlreadyOnGlobal(tx, LEGACY_TABLES, policyId);

  return {
    policy,
    environments,
    approvers,
    bypassers,
    requests,
    reviews,
    additionalPrivileges: [
      ...new Map(
        additionalPrivileges.map((additionalPrivilege) => [additionalPrivilege.id, additionalPrivilege])
      ).values()
    ],
    requesters,
    groupMembers,
    requestIdsAlreadyOnGlobal
  };
};

const migratePolicy = async (tx: Knex, policyId: string): Promise<TPolicyOutcome> => {
  const policy = await lockLegacyPolicy<TLegacyPolicy>(tx, LEGACY_TABLES, policyId);
  if (!policy) return "skipped";

  const requests = (await tx(TableName.AccessApprovalRequest)
    .where({ policyId })
    .orderBy("id", "asc")
    .forUpdate()
    .select("*")) as TLegacyRequest[];

  const data = await readPolicyData(tx, policy, requests);
  const { failures, rows, projectId } = translatePolicy(data, new Date());

  if (failures.length) {
    logFailedChecks({ logPrefix: LOG_PREFIX, policyId, projectId, failures });
    return "failedChecks";
  }

  await insertGlobalPolicyRows(tx, rows);
  await insertGlobalRequestRows(tx, rows);
  await insertChunked(tx, TableName.ApprovalRequestGrants, rows.grants);
  await linkAdditionalPrivilegesToGrants(tx, rows.additionalPrivilegeGrants);

  return "migrated";
};

export async function up(knex: Knex): Promise<void> {
  if (
    !(await knex.schema.hasTable(TableName.AccessApprovalPolicy)) ||
    !(await knex.schema.hasTable(TableName.ApprovalPolicySecretEnvironment))
  ) {
    return;
  }

  await runLegacyPolicyMigration(knex, { tables: LEGACY_TABLES, logPrefix: LOG_PREFIX, migratePolicy });
}

export async function down(knex: Knex): Promise<void> {
  if (
    !(await knex.schema.hasTable(TableName.AccessApprovalPolicy)) ||
    !(await knex.schema.hasTable(TableName.ApprovalPolicies))
  ) {
    return;
  }

  const policyIds = (await knex(TableName.ApprovalPolicies)
    .where({ type: SECRET_ACCESS })
    .whereExists((qb) => {
      void qb
        .select(knex.raw("1"))
        .from(TableName.AccessApprovalPolicy)
        .whereRaw(`"${TableName.AccessApprovalPolicy}"."id" = "${TableName.ApprovalPolicies}"."id"`);
    })
    .pluck("id")) as string[];

  for (const policyId of policyIds) {
    await knex.transaction(async (tx) => {
      await tx.raw(`SET LOCAL statement_timeout = ${POLICY_STATEMENT_TIMEOUT_MS}`);
      const migratedRequestIds = () =>
        tx(TableName.ApprovalRequests)
          .where({ policyId })
          .whereExists((qb) => {
            void qb
              .select(tx.raw("1"))
              .from(TableName.AccessApprovalRequest)
              .whereRaw(`"${TableName.AccessApprovalRequest}"."id" = "${TableName.ApprovalRequests}"."id"`);
          })
          .select("id");

      await tx(TableName.ApprovalRequestGrants).whereIn("requestId", migratedRequestIds()).delete();
      await tx(TableName.ApprovalRequests).whereIn("id", migratedRequestIds()).delete();
      await tx(TableName.ApprovalPolicies).where({ id: policyId }).delete();
    });
  }
}

const config = { transaction: false };
export { config };
