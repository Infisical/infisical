/* eslint-disable no-await-in-loop -- policies migrate one after another on purpose */
import crypto from "node:crypto";

import { Knex } from "knex";

import { chunkArray, groupBy } from "@app/lib/fn";

import { TableName } from "../schemas";
import {
  buildApprovalSteps,
  buildBypasserRows,
  buildGlobalPolicyRow,
  buildPolicyEnvironmentRows,
  buildPolicyStepRows,
  buildRequestStepRows,
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

const LOG_PREFIX = "migrate-secret-approval-policies-to-global";
const SECRET_CHANGE = "secret-change";
const PROJECT_VERSION_V3 = 3;

const LEGACY_TABLES: TLegacyApprovalTables = {
  legacyPolicies: TableName.SecretApprovalPolicy,
  legacyApprovers: TableName.SecretApprovalPolicyApprover,
  legacyBypassers: TableName.SecretApprovalPolicyBypasser,
  legacyEnvironments: TableName.SecretApprovalPolicyEnvironment,
  legacyReviewers: TableName.SecretApprovalRequestReviewer
};

enum LegacyRequestStatus {
  Open = "open",
  Closed = "close"
}

type TLegacyPolicy = {
  id: string;
  name: string;
  approvals: number;
  secretPath: string;
  enforcementLevel: string;
  allowedSelfApprovals: boolean;
  bypassForMachineIdentities: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type TLegacyRequest = {
  id: string;
  policyId: string;
  status: string;
  hasMerged: boolean;
  conflicts?: unknown;
  slug: string;
  folderId: string;
  isReplicated?: boolean | null;
  committerUserId?: string | null;
  committerIdentityId?: string | null;
  statusChangedByUserId?: string | null;
  bypassReason?: string | null;
  commitMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type TProject = { id: string; version: number };

type TCommitter = {
  id: string;
  username: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type TCommitterIdentity = { id: string; name: string };

export type TPolicyData = {
  policy: TLegacyPolicy;
  project: TProject | null;
  environments: TPolicyEnvironment[];
  approvers: TLegacyApprover[];
  bypassers: TLegacyBypasser[];
  requests: TLegacyRequest[];
  reviews: TLegacyReview[];
  committers: TCommitter[];
  committerIdentities: TCommitterIdentity[];
  groupMembers: TGroupMember[];
  requestIdsAlreadyOnGlobal: string[];
};

type TSecretChangeRequestRow = {
  id: string;
  approvalRequestId: string;
  folderId: string;
  slug: string;
  hasMerged: boolean;
  conflicts: string | null;
  commitMessage: string | null;
  bypassReason: string | null;
  isReplicated: boolean | null;
  statusChangedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type TGlobalRows = TGlobalPolicyRows & TGlobalRequestRows & { secretChangeRequests: TSecretChangeRequestRow[] };

type TRequester = {
  requesterId: string | null;
  machineIdentityId: string | null;
  requesterName: string;
  requesterEmail: string;
};

const isId = (id: string | null | undefined): id is string => Boolean(id);

const resolveRequester = (
  request: TLegacyRequest,
  committerById: Map<string, TCommitter>,
  committerIdentityById: Map<string, TCommitterIdentity>
): TRequester => {
  const user = request.committerUserId ? committerById.get(request.committerUserId) : undefined;
  if (user) {
    return {
      requesterId: user.id,
      machineIdentityId: null,
      requesterName: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.username,
      requesterEmail: user.email ?? ""
    };
  }

  const identity = request.committerIdentityId ? committerIdentityById.get(request.committerIdentityId) : undefined;
  if (identity) {
    return { requesterId: null, machineIdentityId: identity.id, requesterName: identity.name, requesterEmail: "" };
  }

  return { requesterId: null, machineIdentityId: null, requesterName: "", requesterEmail: "" };
};

const latestReviewPerReviewer = (reviews: TLegacyReview[]) => {
  const byReviewer = new Map<string, TLegacyReview>();
  [...reviews]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id))
    .forEach((review) => byReviewer.set(review.reviewerUserId, review));
  return [...byReviewer.values()];
};

export const translatePolicy = (data: TPolicyData) => {
  const { policy, project, environments, approvers, bypassers, requests, reviews, committers, committerIdentities } =
    data;
  const failures: TMigrationFailure[] = [];

  const { projectId, orgId } = checkPolicyEnvironments(environments, failures);

  if (!project || project.version !== PROJECT_VERSION_V3) {
    failures.push({
      code: "project-not-v3",
      message: `The global approval system only supports secret change policies on V3 projects, and project ${projectId ?? "unknown"} is on version ${project?.version ?? "unknown"}. Upgrade the project first`
    });
  }
  if (policy.approvals < 1) {
    failures.push({
      code: "invalid-approvals",
      message: `The policy requires ${policy.approvals} approvals, and the global approval system needs at least 1`
    });
  }

  const steps = buildApprovalSteps(
    {
      policy,
      approvers: approvers.map((approver) => ({ ...approver, sequence: 1, approvalsRequired: policy.approvals })),
      groupMembers: data.groupMembers
    },
    failures
  );

  const rows: TGlobalRows = {
    policy: buildGlobalPolicyRow({
      policy,
      projectId,
      orgId,
      type: SECRET_CHANGE,
      conditions: { version: 1, conditions: [] },
      constraints: { version: 1, constraints: { allowedSelfApprovals: policy.allowedSelfApprovals } },
      bypassForMachineIdentities: policy.bypassForMachineIdentities
    }),
    secretEnvironments: buildPolicyEnvironmentRows(policy.id, environments, policy.secretPath),
    ...buildPolicyStepRows(policy.id, steps),
    bypassers: buildBypasserRows(policy.id, bypassers),
    requests: [],
    requestSteps: [],
    eligibleApprovers: [],
    approvals: [],
    secretChangeRequests: []
  };

  checkRequestsAlreadyMigrated(data.requestIdsAlreadyOnGlobal, failures);

  const committerById = new Map(committers.map((committer) => [committer.id, committer]));
  const committerIdentityById = new Map(committerIdentities.map((identity) => [identity.id, identity]));
  const reviewsByRequestId = groupBy(reviews, (review) => review.requestId);
  const knownStatuses = Object.values(LegacyRequestStatus) as string[];

  requests.forEach((request) => {
    const requestReviews = latestReviewPerReviewer(reviewsByRequestId[request.id] ?? []);

    if (!knownStatuses.includes(request.status)) {
      failures.push({
        code: "unknown-request-status",
        requestId: request.id,
        message: `Status '${request.status}' has no equivalent on the global approval system`
      });
    }
    if (request.committerUserId && request.committerIdentityId) {
      failures.push({
        code: "ambiguous-committer",
        requestId: request.id,
        message: `The request names both user ${request.committerUserId} and machine identity ${request.committerIdentityId} as its committer, and the global approval system records one requester`
      });
    }
    checkReviewStatuses(request.id, requestReviews, failures);

    rows.requests.push({
      id: request.id,
      projectId,
      organizationId: orgId,
      policyId: policy.id,
      ...resolveRequester(request, committerById, committerIdentityById),
      type: SECRET_CHANGE,
      status: request.status,
      justification: null,
      currentStep: 1,
      requestData: { version: 1, requestData: {} },
      expiresAt: null,
      scopeType: null,
      scopeId: null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt
    });

    const replay = replayReviews(steps, requestReviews);
    const { requestSteps, eligibleApprovers, approvals } = buildRequestStepRows({
      requestId: request.id,
      steps,
      replay,
      isApprovedLike: false,
      requestCreatedAt: request.createdAt,
      fallbackCompletedAt: request.updatedAt
    });
    rows.requestSteps.push(...requestSteps);
    rows.eligibleApprovers.push(...eligibleApprovers);
    rows.approvals.push(...approvals);

    rows.secretChangeRequests.push({
      id: crypto.randomUUID(),
      approvalRequestId: request.id,
      folderId: request.folderId,
      slug: request.slug,
      hasMerged: request.hasMerged,
      conflicts:
        request.conflicts === null || request.conflicts === undefined ? null : JSON.stringify(request.conflicts),
      commitMessage: request.commitMessage ?? null,
      bypassReason: request.bypassReason ?? null,
      isReplicated: request.isReplicated ?? null,
      statusChangedByUserId: request.statusChangedByUserId ?? null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt
    });
  });

  return { failures, rows, projectId };
};

const relinkCommitsToSecretChangeRequests = async (tx: Knex, secretChangeRequests: TSecretChangeRequestRow[]) => {
  for (const chunk of chunkArray(secretChangeRequests, INSERT_CHUNK_SIZE)) {
    const values = chunk.map(() => "(?::uuid, ?::uuid)").join(", ");
    await tx.raw(
      `UPDATE ${TableName.SecretApprovalRequestSecretV2} AS c
       SET "secretChangeId" = m.secret_change_id, "requestId" = NULL
       FROM (VALUES ${values}) AS m(request_id, secret_change_id)
       WHERE c."requestId" = m.request_id`,
      chunk.flatMap(({ approvalRequestId, id }) => [approvalRequestId, id])
    );
  }
};

const readPolicyData = async (tx: Knex, policy: TLegacyPolicy, requests: TLegacyRequest[]): Promise<TPolicyData> => {
  const { id: policyId } = policy;
  const requestIds = requests.map(({ id }) => id);
  const committerIds = [...new Set(requests.map(({ committerUserId }) => committerUserId).filter(isId))];
  const committerIdentityIds = [
    ...new Set(requests.map(({ committerIdentityId }) => committerIdentityId).filter(isId))
  ];

  const environments = await readPolicyEnvironments(tx, LEGACY_TABLES, policyId);
  const projectId = environments[0]?.projectId;
  const project = projectId
    ? (((await tx(TableName.Project).where({ id: projectId }).first("id", "version")) as TProject | undefined) ?? null)
    : null;

  const approvers = await readLegacyApprovers(tx, LEGACY_TABLES, policyId);
  const bypassers = await readLegacyBypassers(tx, LEGACY_TABLES, policyId);
  const reviews = await readLegacyReviews(tx, LEGACY_TABLES, requestIds, { withComment: true, forUpdate: true });

  const committers = committerIds.length
    ? ((await tx(TableName.Users)
        .whereRaw(`"id" = ANY(?::uuid[])`, [committerIds])
        .select("id", "username", "email", "firstName", "lastName")) as TCommitter[])
    : [];
  const committerIdentities = committerIdentityIds.length
    ? ((await tx(TableName.Identity)
        .whereRaw(`"id" = ANY(?::uuid[])`, [committerIdentityIds])
        .select("id", "name")) as TCommitterIdentity[])
    : [];

  const groupMembers = await readApproverGroupMembers(tx, approvers);
  const requestIdsAlreadyOnGlobal = await readRequestIdsAlreadyOnGlobal(tx, requestIds);

  return {
    policy,
    project,
    environments,
    approvers,
    bypassers,
    requests,
    reviews,
    committers,
    committerIdentities,
    groupMembers,
    requestIdsAlreadyOnGlobal
  };
};

const migratePolicy = async (tx: Knex, policyId: string): Promise<TPolicyOutcome> => {
  const policy = await lockLegacyPolicy<TLegacyPolicy>(tx, LEGACY_TABLES, policyId);
  if (!policy) return "skipped";

  const requests = (await tx(TableName.SecretApprovalRequest)
    .where({ policyId })
    .orderBy("id", "asc")
    .forUpdate()
    .select("*")) as TLegacyRequest[];

  const data = await readPolicyData(tx, policy, requests);
  const { failures, rows, projectId } = translatePolicy(data);

  if (failures.length) {
    logFailedChecks({ logPrefix: LOG_PREFIX, policyId, projectId, failures });
    return "failedChecks";
  }

  await insertGlobalPolicyRows(tx, rows);
  await insertGlobalRequestRows(tx, rows);
  await insertChunked(tx, TableName.SecretChangeRequests, rows.secretChangeRequests);
  await relinkCommitsToSecretChangeRequests(tx, rows.secretChangeRequests);

  return "migrated";
};

export async function up(knex: Knex): Promise<void> {
  if (
    !(await knex.schema.hasTable(TableName.SecretApprovalPolicy)) ||
    !(await knex.schema.hasTable(TableName.SecretChangeRequests))
  ) {
    return;
  }

  await runLegacyPolicyMigration(knex, { tables: LEGACY_TABLES, logPrefix: LOG_PREFIX, migratePolicy });
}

export async function down(knex: Knex): Promise<void> {
  if (
    !(await knex.schema.hasTable(TableName.SecretApprovalPolicy)) ||
    !(await knex.schema.hasTable(TableName.ApprovalPolicies)) ||
    !(await knex.schema.hasTable(TableName.SecretChangeRequests))
  ) {
    return;
  }

  const migratedTwinOf = (legacyTable: TableName, globalTable: TableName) => (qb: Knex.QueryBuilder) => {
    void qb
      .select(knex.raw("1"))
      .from(globalTable)
      .whereRaw(`"${globalTable}"."id" = "${legacyTable}"."id"`)
      .where(`${globalTable}.type`, SECRET_CHANGE);
  };

  const policyIds = (await knex(TableName.SecretApprovalPolicy)
    .where((qb) => {
      void qb
        .whereExists(migratedTwinOf(TableName.SecretApprovalPolicy, TableName.ApprovalPolicies))
        .orWhereExists((sub) => {
          void sub
            .select(knex.raw("1"))
            .from(TableName.SecretApprovalRequest)
            .whereRaw(`"${TableName.SecretApprovalRequest}"."policyId" = "${TableName.SecretApprovalPolicy}"."id"`)
            .whereExists(migratedTwinOf(TableName.SecretApprovalRequest, TableName.ApprovalRequests));
        });
    })
    .orderBy("id", "asc")
    .pluck("id")) as string[];

  for (const policyId of policyIds) {
    await knex.transaction(async (tx) => {
      await tx.raw(`SET LOCAL statement_timeout = ${POLICY_STATEMENT_TIMEOUT_MS}`);

      await tx.raw(
        `UPDATE ${TableName.SecretApprovalRequest} AS lr
         SET "status" = ar."status",
             "hasMerged" = scr."hasMerged",
             "conflicts" = scr."conflicts",
             "statusChangedByUserId" = scr."statusChangedByUserId",
             "bypassReason" = scr."bypassReason"
         FROM ${TableName.ApprovalRequests} AS ar
         JOIN ${TableName.SecretChangeRequests} AS scr ON scr."approvalRequestId" = ar."id"
         WHERE lr."id" = ar."id" AND ar."type" = ? AND lr."policyId" = ?`,
        [SECRET_CHANGE, policyId]
      );

      await tx.raw(
        `UPDATE ${TableName.SecretApprovalRequestSecretV2} AS c
         SET "requestId" = scr."approvalRequestId", "secretChangeId" = NULL
         FROM ${TableName.SecretChangeRequests} AS scr
         JOIN ${TableName.SecretApprovalRequest} AS lr ON lr."id" = scr."approvalRequestId"
         WHERE c."secretChangeId" = scr."id" AND lr."policyId" = ?`,
        [policyId]
      );

      await tx(TableName.ApprovalRequests)
        .where({ type: SECRET_CHANGE })
        .whereIn("id", tx(TableName.SecretApprovalRequest).where({ policyId }).select("id"))
        .delete();

      await tx(TableName.ApprovalPolicies).where({ id: policyId, type: SECRET_CHANGE }).delete();
    });
  }
}

const config = { transaction: false };
export { config };
