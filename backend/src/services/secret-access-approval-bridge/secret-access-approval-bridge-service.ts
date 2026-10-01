import { ForbiddenError, subject } from "@casl/ability";
import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { ActionProjectType, ProjectMembershipRole, TemporaryPermissionMode } from "@app/db/schemas";
import { approvalPolicyMembershipVerifierFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-fns";
import {
  ApproverType,
  BypasserType,
  TCreateAccessApprovalPolicy
} from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { verifyRequestedPermissions } from "@app/ee/services/access-approval-request/access-approval-request-fns";
import { ApprovalStatus } from "@app/ee/services/access-approval-request/access-approval-request-types";
import { flattenActiveRolesFromMemberships } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { QueueJobs, QueueName } from "@app/queue";
import {
  ApprovalPolicyType,
  ApprovalRequestApprovalDecision,
  ApprovalRequestGrantStatus,
  ApprovalRequestStatus,
  ApprovalRequestStepStatus
} from "@app/services/approval-policy/approval-policy-enums";
import { createApprovalRequestWithSteps } from "@app/services/approval-policy/approval-request-fns";
import { SecretAccessPolicyRequestDataSchema } from "@app/services/approval-policy/secret-access/secret-access-policy-schemas";
import { TSecretAccessRequestData } from "@app/services/approval-policy/secret-access/secret-access-policy-types";
import { ActorType } from "@app/services/auth/auth-type";
import { AccessRequestWebhookAction, WebhookEvents } from "@app/services/webhook/webhook-types";

import {
  buildSecretAccessPolicySteps,
  collectSecretAccessPolicyGroupIds,
  collectSecretAccessRequestUserIds,
  composeSecretAccessRequestRows,
  getSecretAccessRequestData,
  hasSameAccessCriteria,
  isPolicySubjectMatch,
  notifySecretAccessStepApprovers,
  parseSecretAccessRequestData,
  secretAccessApprovalPolicyExists,
  toLegacyAccessApprovalRequest
} from "./secret-access-approval-bridge-fns";
import {
  TCountSecretAccessApprovalPoliciesDTO,
  TCountSecretAccessApprovalRequestsDTO,
  TCreateSecretAccessApprovalPolicyDTO,
  TCreateSecretAccessApprovalRequestDTO,
  TDeleteSecretAccessApprovalPolicyDTO,
  TGetSecretAccessApprovalPolicyByIdDTO,
  TListSecretAccessApprovalPoliciesDTO,
  TListSecretAccessApprovalRequestsDTO,
  TReviewSecretAccessApprovalRequestDTO,
  TRevokeSecretAccessApprovalRequestDTO,
  TSecretAccessApprovalBridgeServiceFactoryDep,
  TUpdateSecretAccessApprovalPolicyDTO
} from "./secret-access-approval-bridge-types";

export type TSecretAccessApprovalBridgeServiceFactory = ReturnType<typeof secretAccessApprovalBridgeServiceFactory>;

type TApproverInput = TCreateAccessApprovalPolicy["approvers"];
type TBypasserInput = NonNullable<TCreateAccessApprovalPolicy["bypassers"]>;
type TSequencedSubject = { id: string; sequence?: number };
type TPolicyStep = {
  requiredApprovals: number;
  approvers: { type: ApproverType; id: string }[];
};

export const secretAccessApprovalBridgeServiceFactory = ({
  projectDAL,
  permissionService,
  projectEnvDAL,
  userDAL,
  groupDAL,
  accessApprovalPolicyDAL,
  approvalPolicyDAL,
  approvalPolicyStepsDAL,
  approvalPolicyStepApproversDAL,
  approvalPolicyBypassersDAL,
  approvalPolicySecretEnvironmentDAL,
  secretAccessApprovalBridgeDAL,
  userGroupMembershipDAL,
  approvalRequestDAL,
  approvalRequestStepsDAL,
  approvalRequestStepEligibleApproversDAL,
  approvalRequestApprovalsDAL,
  approvalRequestGrantsDAL,
  additionalPrivilegeDAL,
  smtpService,
  notificationService,
  kmsService,
  projectSlackConfigDAL,
  microsoftTeamsService,
  projectMicrosoftTeamsConfigDAL,
  queueService
}: TSecretAccessApprovalBridgeServiceFactoryDep) => {
  const { verifyProjectSubjectsMembership } = approvalPolicyMembershipVerifierFactory({ projectDAL });

  const $splitApprovers = (approvers: TApproverInput) => ({
    groupApprovers: approvers.filter((approver) => approver.type === ApproverType.Group) as TSequencedSubject[],
    userApprovers: approvers.filter(
      (approver) => approver.type === ApproverType.User && approver.id
    ) as TSequencedSubject[],
    userApproverNames: approvers.filter((approver) => approver.type === ApproverType.User && approver.username) as {
      username: string;
      sequence?: number;
    }[]
  });

  const $resolveApprovers = async (
    approvers: TApproverInput,
    { projectId, orgId }: { projectId: string; orgId: string }
  ) => {
    const { groupApprovers, userApprovers, userApproverNames } = $splitApprovers(approvers);

    let approverUserIds = userApprovers;
    if (userApproverNames.length) {
      const approverUsersInDB = await userDAL.find({
        $in: {
          username: userApproverNames.map((el) => el.username)
        }
      });
      const approverUsersInDBGroupByUsername = groupBy(approverUsersInDB, (i) => i.username);
      const invalidUsernames = userApproverNames.filter((el) => !approverUsersInDBGroupByUsername?.[el.username]?.[0]);

      if (invalidUsernames.length) {
        throw new BadRequestError({
          message: `Invalid approver user: ${invalidUsernames.map((i) => i.username).join(", ")}`
        });
      }

      approverUserIds = approverUserIds.concat(
        userApproverNames.map((el) => ({
          id: approverUsersInDBGroupByUsername[el.username]?.[0].id,
          sequence: el.sequence
        }))
      );
    }

    if (approverUserIds.length > 0 || groupApprovers.length > 0) {
      await verifyProjectSubjectsMembership({
        userIds: approverUserIds.map((au) => au.id),
        groupIds: groupApprovers.map((ga) => ga.id).filter(Boolean),
        orgId,
        projectId
      });
    }

    return { approverUserIds, groupApprovers };
  };

  const $resolveBypassers = async (
    bypassers: TBypasserInput | undefined,
    { projectId, orgId }: { projectId: string; orgId: string }
  ) => {
    let groupBypassers: string[] = [];
    let bypasserUserIds: string[] = [];

    if (bypassers && bypassers.length) {
      groupBypassers = [
        ...new Set(
          bypassers
            .filter((bypasser) => bypasser.type === BypasserType.Group)
            .map((bypasser) => bypasser.id) as string[]
        )
      ];

      const userBypassers = bypassers
        .filter((bypasser) => bypasser.type === BypasserType.User)
        .map((bypasser) => bypasser.id)
        .filter(Boolean) as string[];

      const userBypasserNames = bypassers
        .map((bypasser) => (bypasser.type === BypasserType.User ? bypasser.username : undefined))
        .filter(Boolean) as string[];

      bypasserUserIds = userBypassers;
      if (userBypasserNames.length) {
        const bypasserUsers = await userDAL.find({
          $in: {
            username: userBypasserNames
          }
        });

        const bypasserNamesFromDb = bypasserUsers.map((user) => user.username);
        const invalidUsernames = userBypasserNames.filter((username) => !bypasserNamesFromDb.includes(username));

        if (invalidUsernames.length) {
          throw new BadRequestError({
            message: `Invalid bypasser user: ${invalidUsernames.join(", ")}`
          });
        }

        bypasserUserIds = bypasserUserIds.concat(bypasserUsers.map((user) => user.id));
      }
      bypasserUserIds = [...new Set(bypasserUserIds)];

      if (groupBypassers.length > 0) {
        const orgGroups = await groupDAL.find({
          $in: { id: groupBypassers },
          orgId
        });

        if (orgGroups.length !== groupBypassers.length) {
          const foundGroupIdsInOrg = new Set(orgGroups.map((group) => group.id));
          const missingGroupIds = groupBypassers.filter((id) => !foundGroupIdsInOrg.has(id));
          throw new BadRequestError({
            message: `One or more specified bypasser groups are not part of the organization or do not exist. Invalid or non-member group IDs: ${missingGroupIds.join(", ")}`
          });
        }
      }

      if (bypasserUserIds.length) {
        await verifyProjectSubjectsMembership({
          userIds: bypasserUserIds,
          groupIds: [],
          orgId,
          projectId
        });
      }
    }

    return { bypasserUserIds, groupBypassers };
  };

  const $buildSteps = ({
    approverUserIds,
    groupApprovers,
    approvalsRequired
  }: {
    approverUserIds: TSequencedSubject[];
    groupApprovers: TSequencedSubject[];
    approvalsRequired?: { numberOfApprovals: number; stepNumber: number }[];
  }): TPolicyStep[] =>
    buildSecretAccessPolicySteps(
      [
        ...approverUserIds.map((el) => ({ type: ApproverType.User, id: el.id, sequence: el.sequence ?? 1 })),
        ...groupApprovers.map((el) => ({ type: ApproverType.Group, id: el.id, sequence: el.sequence ?? 1 }))
      ],
      approvalsRequired
    );

  const $insertStepsAndBypassers = async (
    {
      policyId,
      steps,
      bypasserUserIds,
      groupBypassers
    }: { policyId: string; steps: TPolicyStep[]; bypasserUserIds: string[]; groupBypassers: string[] },
    tx: Knex
  ) => {
    const stepDocs = await approvalPolicyStepsDAL.insertMany(
      steps.map((step, i) => ({
        policyId,
        stepNumber: i + 1,
        requiredApprovals: step.requiredApprovals
      })),
      tx
    );

    await approvalPolicyStepApproversDAL.insertMany(
      steps.flatMap((step, i) =>
        step.approvers.map((approver) => ({
          policyStepId: stepDocs[i].id,
          userId: approver.type === ApproverType.User ? approver.id : null,
          groupId: approver.type === ApproverType.Group ? approver.id : null
        }))
      ),
      tx
    );

    if (bypasserUserIds.length || groupBypassers.length) {
      await approvalPolicyBypassersDAL.insertMany(
        [
          ...bypasserUserIds.map((userId) => ({ policyId, userId, groupId: null })),
          ...groupBypassers.map((groupId) => ({ policyId, userId: null, groupId }))
        ],
        tx
      );
    }
  };

  const $getProjectPermission = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId
  }: Pick<TUpdateSecretAccessApprovalPolicyDTO, "actor" | "actorId" | "actorAuthMethod" | "actorOrgId"> & {
    projectId: string;
  }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    return permission;
  };

  const $findPolicyById = async (policyId: string, message: string) => {
    const [policy] = await secretAccessApprovalBridgeDAL.findSecretAccessPolicies({ policyId });
    if (!policy) throw new NotFoundError({ message });
    return policy;
  };

  const createAccessApprovalPolicy = async ({
    name,
    actor,
    actorId,
    actorOrgId,
    secretPath,
    actorAuthMethod,
    approvals,
    approvers,
    bypassers,
    projectSlug,
    environment,
    environments,
    enforcementLevel,
    allowedSelfApprovals,
    approvalsRequired,
    maxTimePeriod,
    requestExpirationTime
  }: TCreateSecretAccessApprovalPolicyDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const permission = await $getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: project.id
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretApproval
    );

    const mergedEnvs = (environment ? [environment] : environments) || [];
    if (mergedEnvs.length === 0) {
      throw new BadRequestError({ message: "Must provide either environment or environments" });
    }
    const envs = await projectEnvDAL.find({ $in: { slug: mergedEnvs }, projectId: project.id });
    if (!envs.length || envs.length !== mergedEnvs.length) {
      const notFoundEnvs = mergedEnvs.filter((env) => !envs.find((el) => el.slug === env));
      throw new NotFoundError({ message: `One or more environments not found: ${notFoundEnvs.join(", ")}` });
    }

    for (const env of envs) {
      if (
        // eslint-disable-next-line no-await-in-loop
        await secretAccessApprovalPolicyExists(
          { envId: env.id, secretPath },
          { accessApprovalPolicyDAL, approvalPolicySecretEnvironmentDAL }
        )
      ) {
        throw new BadRequestError({
          message: `A policy for secret path '${secretPath}' already exists in environment '${env.slug}'`
        });
      }
    }

    const scope = { projectId: project.id, orgId: project.orgId };
    const { approverUserIds, groupApprovers } = await $resolveApprovers(approvers, scope);
    const { bypasserUserIds, groupBypassers } = await $resolveBypassers(bypassers, scope);
    const steps = $buildSteps({ approverUserIds, groupApprovers, approvalsRequired });

    const policy = await approvalPolicyDAL.transaction(async (tx) => {
      const doc = await approvalPolicyDAL.create(
        {
          projectId: project.id,
          organizationId: project.orgId,
          type: ApprovalPolicyType.SecretAccess,
          name,
          enforcementLevel,
          maxRequestTtl: maxTimePeriod ?? null,
          bypassForMachineIdentities: false,
          scopeType: null,
          scopeId: null,
          conditions: { version: 1, conditions: {} },
          constraints: {
            version: 1,
            constraints: { allowedSelfApprovals, requestExpirationTime: requestExpirationTime ?? null }
          }
        },
        tx
      );

      await approvalPolicySecretEnvironmentDAL.insertMany(
        envs.map((env) => ({ policyId: doc.id, envId: env.id, secretPath })),
        tx
      );

      await $insertStepsAndBypassers({ policyId: doc.id, steps, bypasserUserIds, groupBypassers }, tx);

      return doc;
    });

    return {
      id: policy.id,
      name: policy.name,
      secretPath,
      approvals,
      envId: envs[0].id,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
      enforcementLevel: policy.enforcementLevel,
      deletedAt: null,
      allowedSelfApprovals,
      bypassForMachineIdentities: false,
      maxTimePeriod: policy.maxRequestTtl ?? null,
      requestExpirationTime: requestExpirationTime ?? null,
      environment: envs[0],
      environments: envs,
      projectId: project.id
    };
  };

  const updateAccessApprovalPolicy = async ({
    policyId,
    approvers,
    bypassers,
    secretPath,
    name,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    approvals,
    enforcementLevel,
    allowedSelfApprovals,
    approvalsRequired,
    environments,
    maxTimePeriod,
    requestExpirationTime
  }: TUpdateSecretAccessApprovalPolicyDTO) => {
    const policy = await $findPolicyById(policyId, `Access approval policy with ID '${policyId}' not found`);

    const permission = await $getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: policy.projectId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretApproval);

    const { groupApprovers: groupApproverInputs, userApprovers, userApproverNames } = $splitApprovers(approvers);
    const currentApprovals = approvals || policy.approvals;
    if (groupApproverInputs.length === 0 && currentApprovals > userApprovers.length + userApproverNames.length) {
      throw new BadRequestError({ message: "Approvals cannot be greater than approvers" });
    }

    let envs: { id: string; slug: string }[] = policy.environments;
    if (environments) {
      envs = await projectEnvDAL.find({ $in: { slug: environments }, projectId: policy.projectId });
      if (envs.length !== environments.length) {
        const notFoundEnvs = environments.filter((env) => !envs.find((el) => el.slug === env));
        throw new NotFoundError({ message: `One or more environments not found: ${notFoundEnvs.join(", ")}` });
      }
    }

    const nextSecretPath = secretPath || policy.secretPath;
    for (const env of envs) {
      if (
        // eslint-disable-next-line no-await-in-loop
        await secretAccessApprovalPolicyExists(
          { envId: env.id, secretPath: nextSecretPath, excludePolicyId: policy.id },
          { accessApprovalPolicyDAL, approvalPolicySecretEnvironmentDAL }
        )
      ) {
        throw new BadRequestError({
          message: `A policy for secret path '${nextSecretPath}' already exists in environment '${env.slug}'`
        });
      }
    }

    const scope = { projectId: policy.projectId, orgId: actorOrgId };
    const { approverUserIds, groupApprovers } = await $resolveApprovers(approvers, scope);
    const { bypasserUserIds, groupBypassers } = await $resolveBypassers(bypassers, scope);
    const steps = $buildSteps({ approverUserIds, groupApprovers, approvalsRequired });

    return approvalPolicyDAL.transaction(async (tx) => {
      await approvalPolicyDAL.updateById(
        policy.id,
        {
          name,
          enforcementLevel,
          maxRequestTtl: maxTimePeriod,
          constraints: {
            version: 1,
            constraints: {
              allowedSelfApprovals,
              requestExpirationTime:
                requestExpirationTime === undefined ? policy.requestExpirationTime : requestExpirationTime
            }
          }
        },
        tx
      );

      await approvalPolicyStepsDAL.delete({ policyId: policy.id }, tx);
      await approvalPolicyBypassersDAL.delete({ policyId: policy.id }, tx);
      await $insertStepsAndBypassers({ policyId: policy.id, steps, bypasserUserIds, groupBypassers }, tx);

      if (environments || secretPath) {
        await approvalPolicySecretEnvironmentDAL.delete({ policyId: policy.id }, tx);
        await approvalPolicySecretEnvironmentDAL.insertMany(
          envs.map((env) => ({ policyId: policy.id, envId: env.id, secretPath: nextSecretPath })),
          tx
        );
      }

      const [updatedPolicy] = await secretAccessApprovalBridgeDAL.findSecretAccessPolicies({ policyId: policy.id }, tx);
      return updatedPolicy;
    });
  };

  const deleteAccessApprovalPolicy = async ({
    policyId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteSecretAccessApprovalPolicyDTO) => {
    const policy = await $findPolicyById(policyId, `Secret approval policy with ID '${policyId}' not found`);

    const permission = await $getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: policy.projectId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.SecretApproval
    );

    await approvalPolicyDAL.deleteById(policy.id);

    return policy;
  };

  const getAccessApprovalPolicyById = async ({
    policyId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetSecretAccessApprovalPolicyByIdDTO) => {
    const policy = await $findPolicyById(policyId, `Cannot find access approval policy with ID ${policyId}`);

    const permission = await $getProjectPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId: policy.projectId
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);

    return policy;
  };

  const listAccessApprovalPolicies = ({ projectId }: TListSecretAccessApprovalPoliciesDTO) =>
    secretAccessApprovalBridgeDAL.findSecretAccessPolicies({ projectId });

  const countAccessApprovalPolicies = async ({ projectId, envId }: TCountSecretAccessApprovalPoliciesDTO) => {
    const policies = await secretAccessApprovalBridgeDAL.findSecretAccessPolicies({ projectId, envId });
    return policies.length;
  };

  const $findRequestById = async (requestId: string) => {
    const request = await secretAccessApprovalBridgeDAL.findSecretAccessRequestById(requestId);
    if (!request) throw new NotFoundError({ message: `Access request with ID '${requestId}' not found` });
    return request;
  };

  const $getActorGroupIds = async (actorId: string, orgId: string) => {
    const groups = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(actorId, orgId);
    return new Set(groups.map((group) => group.groupId));
  };

  const $loadRequestRows = async (filter: { projectId: string; policyId?: string; requesterId?: string }) => {
    const requests = await secretAccessApprovalBridgeDAL.findSecretAccessRequests(filter);
    if (!requests.length) return [];

    const requestIds = requests.map((request) => request.id);
    const [policies, grants, approvals] = await Promise.all([
      secretAccessApprovalBridgeDAL.findSecretAccessPolicies({ projectId: filter.projectId }),
      secretAccessApprovalBridgeDAL.findGrantsByRequestIds(requestIds),
      secretAccessApprovalBridgeDAL.findApprovalsByRequestIds(requestIds)
    ]);

    const [privileges, groupMembers] = await Promise.all([
      secretAccessApprovalBridgeDAL.findPrivilegesByGrantIds(grants.map((grant) => grant.id)),
      secretAccessApprovalBridgeDAL.findGroupMembers(collectSecretAccessPolicyGroupIds(policies))
    ]);

    const userIds = collectSecretAccessRequestUserIds({ requests, policies, grants, approvals, groupMembers });
    const [users, orgMemberships] = await Promise.all([
      secretAccessApprovalBridgeDAL.findUsersByIds(userIds),
      secretAccessApprovalBridgeDAL.findOrgMembershipActivity(requests[0].organizationId, userIds)
    ]);

    return composeSecretAccessRequestRows({
      requests,
      policies,
      grants,
      privileges,
      approvals,
      groupMembers,
      users,
      orgMemberships
    });
  };

  const listAccessApprovalRequests = async ({ projectId }: TListSecretAccessApprovalRequestsDTO) => {
    const rows = await $loadRequestRows({ projectId });

    return rows.flatMap((row) => {
      if (!row.policy || !row.environment || !row.requestedByUser) return [];
      const data = parseSecretAccessRequestData(row.request.requestData);
      if (!data) return [];

      const legacy = toLegacyAccessApprovalRequest(
        { ...row.request, grant: row.grant, privilegeId: row.privilegeId },
        row.approvedByUser?.userId ?? null
      );
      const { approvers, bypassers, ...policy } = row.policy;

      return [
        {
          ...legacy,
          projectId,
          environment: row.environment.slug,
          environmentName: row.environment.name,
          policy: { ...policy, approvers, bypassers },
          requestedByUser: row.requestedByUser,
          approvedByUser: row.approvedByUser,
          revokedByUser: row.revokedByUser,
          privilege: legacy.privilegeId ? row.privilege : null,
          isApproved: legacy.status === ApprovalStatus.APPROVED,
          reviewers: row.reviewers,
          approvers,
          bypassers
        }
      ];
    });
  };

  const countAccessApprovalRequests = async ({
    projectId,
    policyId,
    requesterId
  }: TCountSecretAccessApprovalRequestsDTO) => {
    const rows = await $loadRequestRows({ projectId, policyId, requesterId });
    const now = new Date();

    const isPending = (row: (typeof rows)[number]) =>
      Boolean(row.policy) &&
      row.request.status === ApprovalRequestStatus.Pending &&
      !row.reviewers.some((reviewer) => reviewer.status === ApprovalRequestApprovalDecision.Rejected) &&
      !(row.request.expiresAt && new Date(row.request.expiresAt) < now);

    const pendingCount = rows.filter(isPending).length;
    return { pendingCount, finalizedCount: rows.length - pendingCount };
  };

  const $queueAccessRequestCreatedWebhook = async ({
    request,
    project,
    policy,
    requestedByUser,
    envId,
    envSlug,
    secretPath
  }: {
    request: ReturnType<typeof toLegacyAccessApprovalRequest>;
    project: { id: string; name: string; orgId: string };
    policy: Awaited<ReturnType<typeof $findPolicyById>>;
    requestedByUser: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      username: string;
      email?: string | null;
    };
    envId: string;
    envSlug: string;
    secretPath: string;
  }) => {
    const { requestedPermissions } = verifyRequestedPermissions({ permissions: request.permissions });
    const cfg = getConfig();

    await queueService.queue(
      QueueName.SecretWebhook,
      QueueJobs.SecWebhook,
      {
        type: WebhookEvents.AccessRequestModified,
        payload: {
          projectId: project.id,
          projectName: project.name,
          environment: envSlug,
          environmentName: policy.environments.find((env) => env.id === envId)?.name,
          secretPath,
          action: AccessRequestWebhookAction.Created,
          request: {
            id: request.id,
            url: `${cfg.SITE_URL}/organizations/${project.orgId}/projects/secret-management/${project.id}/approval?selectedTab=resource-requests&requestId=${request.id}`,
            status: request.status,
            isBypassed: false,
            policy: {
              id: policy.id,
              name: policy.name,
              enforcementLevel: policy.enforcementLevel,
              hasSequencedApprovers: policy.approvers.some((approver) => (approver.sequence ?? 1) > 1)
            },
            requestedAccess: {
              isTemporary: request.isTemporary,
              temporaryRange: request.temporaryRange,
              permissions: requestedPermissions
            },
            requestedBy: {
              type: ActorType.USER,
              id: requestedByUser.id,
              name:
                [requestedByUser.firstName, requestedByUser.lastName].filter(Boolean).join(" ") ||
                requestedByUser.username,
              email: requestedByUser.email ?? null
            },
            expiresAt: request.expiresAt?.toISOString() ?? null,
            approvedAt: null,
            revokedAt: null,
            createdAt: request.createdAt.toISOString(),
            updatedAt: request.updatedAt.toISOString()
          }
        }
      },
      {
        jobId: `access-request-webhook-${request.id}-${alphaNumericNanoId(6)}`,
        removeOnFail: { count: 5 },
        removeOnComplete: true,
        delay: 1000,
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 }
      }
    );
  };

  const isGlobalAccessApprovalRequest = async (requestId: string) =>
    Boolean(await approvalRequestDAL.findOne({ id: requestId, type: ApprovalPolicyType.SecretAccess }));

  const createAccessApprovalRequest = async ({
    policy: policyRef,
    projectId,
    envId,
    envSlug,
    secretPath,
    requestedByUserId,
    actorOrgId,
    permissions,
    isTemporary,
    temporaryRange,
    note
  }: TCreateSecretAccessApprovalRequestDTO) => {
    const policy = await $findPolicyById(
      policyRef.id,
      `No policy in environment with slug '${envSlug}' and with secret path '${secretPath}' was found.`
    );

    if (policy.maxTimePeriod) {
      if (!temporaryRange || ms(temporaryRange) > ms(policy.maxTimePeriod)) {
        throw new BadRequestError({
          message: `Requested access time range is limited to ${policy.maxTimePeriod} by policy`
        });
      }
    }

    const [requestedByUser, project, policySteps] = await Promise.all([
      userDAL.findById(requestedByUserId),
      projectDAL.findById(projectId),
      approvalPolicyDAL.findStepsByPolicyId(policy.id)
    ]);
    if (!requestedByUser) throw new ForbiddenRequestError({ message: "User not found" });
    if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
    if (!policySteps.length) {
      throw new BadRequestError({ message: `Policy '${policy.name}' has no approvers configured` });
    }

    const activeGrants = await secretAccessApprovalBridgeDAL.findActiveGrants({
      projectId,
      granteeUserId: requestedByUserId
    });
    const activeGrant = activeGrants.find((grant) =>
      hasSameAccessCriteria(SecretAccessPolicyRequestDataSchema.safeParse(grant.attributes).data ?? null, {
        permissions,
        isTemporary
      })
    );
    if (activeGrant) {
      throw new BadRequestError({ message: "You already have an active privilege with the same criteria" });
    }

    const pendingRequests = await secretAccessApprovalBridgeDAL.findPendingRequests({
      policyId: policy.id,
      requesterId: requestedByUserId
    });
    const pendingDuplicate = pendingRequests.find((request) =>
      hasSameAccessCriteria(parseSecretAccessRequestData(request.requestData), { permissions, isTemporary })
    );
    if (pendingDuplicate) {
      throw new BadRequestError({ message: "You already have a pending access request with the same criteria" });
    }

    const parsedMs = policy.requestExpirationTime ? ms(policy.requestExpirationTime) : null;
    const expiresAt = parsedMs && !Number.isNaN(parsedMs) ? new Date(Date.now() + parsedMs) : null;

    const requestData: TSecretAccessRequestData = {
      envId,
      envSlug,
      secretPath,
      permissions,
      isTemporary,
      temporaryRange: temporaryRange || null
    };

    const created = await approvalRequestDAL.transaction((tx) =>
      createApprovalRequestWithSteps(
        {
          projectId,
          organizationId: actorOrgId,
          policyId: policy.id,
          policyType: ApprovalPolicyType.SecretAccess,
          policySteps,
          requestData,
          justification: note || null,
          expiresAt,
          requesterUserId: requestedByUserId,
          requesterName:
            `${requestedByUser.firstName ?? ""} ${requestedByUser.lastName ?? ""}`.trim() || requestedByUser.username,
          requesterEmail: requestedByUser.email || requestedByUser.username
        },
        { approvalRequestDAL, approvalRequestStepsDAL, approvalRequestStepEligibleApproversDAL },
        tx
      )
    );

    const request = await $findRequestById(created.id);
    await notifySecretAccessStepApprovers(
      { step: policySteps[0], request, project, requestedByUser, data: requestData },
      {
        userDAL,
        userGroupMembershipDAL,
        projectDAL,
        projectSlackConfigDAL,
        kmsService,
        microsoftTeamsService,
        projectMicrosoftTeamsConfigDAL,
        notificationService,
        smtpService
      }
    );

    const legacyRequest = toLegacyAccessApprovalRequest(request);

    try {
      await $queueAccessRequestCreatedWebhook({
        request: legacyRequest,
        project,
        policy,
        requestedByUser,
        envId,
        envSlug,
        secretPath
      });
    } catch (error) {
      logger.error(
        error,
        `Failed to queue access request webhook [requestId=${request.id}] [action=${AccessRequestWebhookAction.Created}]`
      );
    }

    return { request: legacyRequest, projectId };
  };

  const reviewAccessApprovalRequest = async ({
    requestId,
    status,
    bypassReason,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TReviewSecretAccessApprovalRequestDTO) => {
    if (bypassReason !== undefined) {
      throw new BadRequestError({ message: "Break-glass approvals are not supported for this request yet" });
    }

    const request = await $findRequestById(requestId);
    if (!request.policyId) {
      throw new BadRequestError({ message: "The policy associated with this access request has been deleted." });
    }
    const policy = await $findPolicyById(
      request.policyId,
      "The policy associated with this access request has been deleted."
    );
    if (!request.requesterId) {
      throw new NotFoundError({ message: "The user who created this access request no longer exists" });
    }

    const { memberships } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: request.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const activeRoles = flattenActiveRolesFromMemberships(memberships, ProjectMembershipRole.Custom);
    const hasOnlyNoAccessRole =
      activeRoles.length > 0 && activeRoles.every((r) => r.role === ProjectMembershipRole.NoAccess);
    if (hasOnlyNoAccessRole) {
      throw new ForbiddenRequestError({ message: "You are not authorized to review this request" });
    }

    if (request.status !== ApprovalRequestStatus.Pending) {
      throw new BadRequestError({ message: "The request has been closed" });
    }
    if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
      await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Expired });
      throw new BadRequestError({ message: "This access request has expired and can no longer be reviewed" });
    }

    const data = getSecretAccessRequestData(request);
    if (data.isTemporary && !data.temporaryRange) {
      throw new BadRequestError({ message: "Temporary range is required for temporary access" });
    }

    const isSelfReview = actorId === request.requesterId;
    const isApproving = status === ApprovalStatus.APPROVED;
    if (isSelfReview && isApproving && !policy.allowedSelfApprovals) {
      throw new BadRequestError({
        message: "Failed to review access approval request. Users are not authorized to review their own request."
      });
    }

    const actorGroupIds = await $getActorGroupIds(actorId, actorOrgId);

    const project = await projectDAL.findById(request.projectId);
    if (!project) {
      throw new NotFoundError({ message: "The project associated with this access request was not found." });
    }

    const { approval, nextStep } = await approvalRequestDAL.transaction(async (tx) => {
      const locked = await approvalRequestDAL.findByIdForUpdate(requestId, tx);
      if (!locked || locked.status !== ApprovalRequestStatus.Pending) {
        throw new BadRequestError({ message: "The request has been closed" });
      }

      const steps = await approvalRequestStepsDAL.find({ requestId }, { tx, sort: [["stepNumber", "asc"]] });
      const currentStepIndex = steps.findIndex((step) => step.stepNumber === locked.currentStep);
      const currentStep = steps[currentStepIndex];
      if (!currentStep) throw new BadRequestError({ message: "Current step not found" });

      const eligibleApprovers = await approvalRequestStepEligibleApproversDAL.find({ stepId: currentStep.id }, { tx });
      const stepApprovers = eligibleApprovers.map((approver) => ({
        type: approver.userId ? ApproverType.User : ApproverType.Group,
        id: (approver.userId || approver.groupId) as string
      }));

      const isSelfRejection = isSelfReview && !isApproving;
      if (!isSelfRejection && !isPolicySubjectMatch(stepApprovers, actorId, actorGroupIds)) {
        throw new BadRequestError({ message: "You are not a reviewer in this step" });
      }

      const stepApprovals = await approvalRequestApprovalsDAL.find({ stepId: currentStep.id }, { tx });
      if (stepApprovals.some((a) => a.approverUserId === actorId)) {
        throw new BadRequestError({ message: "You have already reviewed this request" });
      }

      const createdApproval = await approvalRequestApprovalsDAL.create(
        {
          stepId: currentStep.id,
          approverUserId: actorId,
          decision: isApproving ? ApprovalRequestApprovalDecision.Approved : ApprovalRequestApprovalDecision.Rejected
        },
        tx
      );

      if (!isApproving) {
        await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Rejected }, tx);
        return { approval: createdApproval, nextStep: null };
      }

      const approvedCount =
        stepApprovals.filter((a) => a.decision === ApprovalRequestApprovalDecision.Approved).length + 1;
      if (approvedCount < currentStep.requiredApprovals) {
        return { approval: createdApproval, nextStep: null };
      }

      await approvalRequestStepsDAL.updateById(
        currentStep.id,
        { status: ApprovalRequestStepStatus.Completed, completedAt: new Date() },
        tx
      );

      const upcomingStep = steps[currentStepIndex + 1];
      if (upcomingStep) {
        await approvalRequestDAL.updateById(requestId, { currentStep: locked.currentStep + 1 }, tx);
        await approvalRequestStepsDAL.updateById(
          upcomingStep.id,
          { status: ApprovalRequestStepStatus.InProgress, startedAt: new Date() },
          tx
        );
        const upcomingApprovers = await approvalRequestStepEligibleApproversDAL.find(
          { stepId: upcomingStep.id },
          { tx }
        );
        return {
          approval: createdApproval,
          nextStep: {
            requiredApprovals: upcomingStep.requiredApprovals,
            approvers: upcomingApprovers.map((approver) => ({
              type: approver.userId ? ApproverType.User : ApproverType.Group,
              id: (approver.userId || approver.groupId) as string
            }))
          }
        };
      }

      await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Approved }, tx);

      const startTime = new Date();
      const endTime = data.isTemporary ? new Date(startTime.getTime() + ms(data.temporaryRange!)) : null;

      const grant = await approvalRequestGrantsDAL.create(
        {
          projectId: request.projectId,
          requestId: request.id,
          granteeUserId: request.requesterId,
          status: ApprovalRequestGrantStatus.Active,
          type: ApprovalPolicyType.SecretAccess,
          attributes: data,
          expiresAt: endTime
        },
        tx
      );

      await additionalPrivilegeDAL.create(
        {
          actorUserId: request.requesterId,
          projectId: request.projectId,
          name: `requested-privilege-${slugify(alphaNumericNanoId(12))}`,
          permissions: JSON.stringify(data.permissions),
          grantId: grant.id,
          ...(data.isTemporary && {
            isTemporary: true,
            temporaryMode: TemporaryPermissionMode.Relative,
            temporaryRange: data.temporaryRange!,
            temporaryAccessStartTime: startTime,
            temporaryAccessEndTime: endTime
          })
        },
        tx
      );

      return { approval: createdApproval, nextStep: null };
    });

    if (nextStep) {
      const requestedByUser = await userDAL.findById(request.requesterId);
      if (requestedByUser) {
        await notifySecretAccessStepApprovers(
          { step: nextStep, request, project, requestedByUser, data },
          {
            userDAL,
            userGroupMembershipDAL,
            projectDAL,
            projectSlackConfigDAL,
            kmsService,
            microsoftTeamsService,
            projectMicrosoftTeamsConfigDAL,
            notificationService,
            smtpService
          }
        );
      }
    }

    const createdAt = approval.createdAt ?? new Date();
    return {
      id: approval.id,
      requestId,
      reviewerUserId: approval.approverUserId,
      status: approval.decision,
      createdAt,
      updatedAt: createdAt,
      projectId: request.projectId,
      policyId: policy.id,
      isBypass: false
    };
  };

  const revokeAccessApprovalRequest = async ({
    requestId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: TRevokeSecretAccessApprovalRequestDTO) => {
    const request = await $findRequestById(requestId);
    if (!request.requesterId) {
      throw new NotFoundError({ message: "The user who created this access request no longer exists" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: request.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const targetUser = await userDAL.findById(request.requesterId);
    if (!targetUser) throw new NotFoundError({ message: "Target user not found" });

    const memberSubject = subject(ProjectPermissionSub.Member, { userEmail: targetUser.email ?? undefined });
    const canAssignAdditionalPrivileges = permission.can(
      ProjectPermissionMemberActions.AssignAdditionalPrivileges,
      memberSubject
    );
    const canGrantPrivilegesLegacy = permission.can(ProjectPermissionMemberActions.GrantPrivileges, memberSubject);

    let isApprover = false;
    if (!canAssignAdditionalPrivileges && !canGrantPrivilegesLegacy && request.policyId) {
      const [policy] = await secretAccessApprovalBridgeDAL.findSecretAccessPolicies({ policyId: request.policyId });
      if (policy) {
        const actorGroupIds = await $getActorGroupIds(actorId, actorOrgId);
        isApprover = isPolicySubjectMatch(policy.approvers, actorId, actorGroupIds);
      }
    }

    if (!canAssignAdditionalPrivileges && !canGrantPrivilegesLegacy && !isApprover) {
      throw new ForbiddenRequestError({
        message: "You do not have permission to revoke additional privileges for this user"
      });
    }

    const { grant } = request;
    if (
      request.status !== ApprovalRequestStatus.Approved ||
      !grant ||
      grant.status !== ApprovalRequestGrantStatus.Active
    ) {
      throw new BadRequestError({ message: "Only approved requests can be revoked" });
    }

    await approvalRequestDAL.transaction(async (tx) => {
      const locked = await approvalRequestGrantsDAL.findByIdForUpdate(grant.id, tx);
      if (!locked || locked.status !== ApprovalRequestGrantStatus.Active) {
        throw new BadRequestError({ message: "Only approved requests can be revoked" });
      }
      await approvalRequestGrantsDAL.updateById(
        grant.id,
        { status: ApprovalRequestGrantStatus.Revoked, revokedAt: new Date(), revokedByUserId: actorId },
        tx
      );
      await additionalPrivilegeDAL.delete({ grantId: grant.id }, tx);
    });

    const revoked = await $findRequestById(requestId);
    return { request: toLegacyAccessApprovalRequest(revoked), projectId: request.projectId };
  };

  return {
    createAccessApprovalPolicy,
    updateAccessApprovalPolicy,
    deleteAccessApprovalPolicy,
    getAccessApprovalPolicyById,
    listAccessApprovalPolicies,
    countAccessApprovalPolicies,
    isGlobalAccessApprovalRequest,
    listAccessApprovalRequests,
    countAccessApprovalRequests,
    createAccessApprovalRequest,
    reviewAccessApprovalRequest,
    revokeAccessApprovalRequest
  };
};
