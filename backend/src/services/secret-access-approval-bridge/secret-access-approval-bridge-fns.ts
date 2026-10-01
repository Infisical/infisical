import msFn from "ms";
import { z } from "zod";

import { TAdditionalPrivileges, TApprovalRequestGrants, TApprovalRequests, TUsers } from "@app/db/schemas";
import { TAccessApprovalPolicyDALFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-dal";
import { ApprovalStatus } from "@app/ee/services/access-approval-request/access-approval-request-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { triggerWorkflowIntegrationNotification } from "@app/lib/workflow-integrations/trigger-notification";
import { TriggerFeature } from "@app/lib/workflow-integrations/types";
import { TApprovalPolicySecretEnvironmentDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import {
  ApprovalRequestGrantStatus,
  ApprovalRequestStatus,
  ApproverType
} from "@app/services/approval-policy/approval-policy-enums";
import { ApprovalPolicyStep } from "@app/services/approval-policy/approval-policy-types";
import { resolveStepApproverUserIds } from "@app/services/approval-policy/approval-request-fns";
import { SecretAccessPolicyRequestDataSchema } from "@app/services/approval-policy/secret-access/secret-access-policy-schemas";
import { TSecretAccessRequestData } from "@app/services/approval-policy/secret-access/secret-access-policy-types";
import { NotificationType } from "@app/services/notification/notification-types";
import { SmtpTemplates } from "@app/services/smtp/smtp-service";

import { TSecretAccessApprovalBridgeDALFactory } from "./secret-access-approval-bridge-dal";
import { TSecretAccessApprovalBridgeServiceFactoryDep } from "./secret-access-approval-bridge-types";

const StoredRequestDataSchema = z.object({ version: z.literal(1), requestData: SecretAccessPolicyRequestDataSchema });

export const parseSecretAccessRequestData = (requestData: unknown): TSecretAccessRequestData | null => {
  const parsed = StoredRequestDataSchema.safeParse(requestData);
  return parsed.success ? parsed.data.requestData : null;
};

// jsonb does not preserve object key order, so a stored permission set has to be
// compared against the incoming one on a canonical form rather than raw JSON text.
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

export const hasSameAccessCriteria = (
  data: TSecretAccessRequestData | null,
  criteria: { permissions: unknown; isTemporary: boolean }
) => {
  if (!data) return false;
  return (
    data.isTemporary === criteria.isTemporary &&
    JSON.stringify(canonicalize(data.permissions)) === JSON.stringify(canonicalize(criteria.permissions))
  );
};

type TSecretAccessApprovalPolicyExistsDep = {
  accessApprovalPolicyDAL: Pick<TAccessApprovalPolicyDALFactory, "findPolicyByEnvIdAndSecretPath">;
  approvalPolicySecretEnvironmentDAL: Pick<
    TApprovalPolicySecretEnvironmentDALFactory,
    "findPolicyByEnvIdsAndSecretPath"
  >;
};

export const secretAccessApprovalPolicyExists = async (
  { envId, secretPath, excludePolicyId }: { envId: string; secretPath: string; excludePolicyId?: string },
  { accessApprovalPolicyDAL, approvalPolicySecretEnvironmentDAL }: TSecretAccessApprovalPolicyExistsDep
) => {
  const legacyPolicy = await accessApprovalPolicyDAL.findPolicyByEnvIdAndSecretPath({ envIds: [envId], secretPath });
  if (legacyPolicy && legacyPolicy.id !== excludePolicyId) return true;

  const policy = await approvalPolicySecretEnvironmentDAL.findPolicyByEnvIdsAndSecretPath({
    envIds: [envId],
    secretPath,
    excludePolicyId
  });
  return Boolean(policy);
};

export type TSecretAccessRequestRow = TApprovalRequests & {
  grant: TApprovalRequestGrants | null;
  privilegeId: string | null;
};

export const getSecretAccessRequestData = (
  request: Pick<TSecretAccessRequestRow, "requestData">
): TSecretAccessRequestData => {
  const data = parseSecretAccessRequestData(request.requestData);
  if (!data) {
    throw new BadRequestError({ message: "The access request is malformed and cannot be processed" });
  }
  return data;
};

export const toLegacyAccessApprovalRequest = (
  request: Pick<
    TSecretAccessRequestRow,
    | "id"
    | "policyId"
    | "requesterId"
    | "requestData"
    | "justification"
    | "status"
    | "expiresAt"
    | "createdAt"
    | "updatedAt"
    | "grant"
    | "privilegeId"
  >,
  approvedByUserId: string | null = null
): {
  id: string;
  policyId: string;
  requestedByUserId: string;
  isTemporary: boolean;
  temporaryRange: string | null;
  permissions: unknown;
  note: string | null;
  privilegeId: string | null;
  status: string;
  expiresAt: Date | null;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  editedByUserId: null;
  editNote: null;
  bypassReason: null;
  privilegeDeletedAt: null;
} => {
  if (!request.policyId) {
    throw new BadRequestError({ message: "The policy associated with this access request has been deleted." });
  }
  if (!request.requesterId) {
    throw new NotFoundError({ message: "The user who created this access request no longer exists" });
  }

  const data = getSecretAccessRequestData(request);
  const { grant } = request;
  const isRevoked = grant?.status === ApprovalRequestGrantStatus.Revoked;

  let { status } = request;
  if (isRevoked) status = ApprovalStatus.REVOKED;
  else if (request.status === ApprovalRequestStatus.Cancelled) status = ApprovalStatus.REJECTED;

  return {
    id: request.id,
    policyId: request.policyId,
    requestedByUserId: request.requesterId,
    isTemporary: data.isTemporary,
    temporaryRange: data.temporaryRange,
    permissions: data.permissions,
    note: request.justification ?? null,
    privilegeId: grant?.status === ApprovalRequestGrantStatus.Active ? request.privilegeId : null,
    status,
    expiresAt: request.expiresAt ?? null,
    approvedAt: grant?.createdAt ?? null,
    approvedByUserId,
    revokedAt: grant?.revokedAt ?? null,
    revokedByUserId: grant?.revokedByUserId ?? null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    editedByUserId: null,
    editNote: null,
    bypassReason: null,
    privilegeDeletedAt: null
  };
};

type TNotifySecretAccessStepApproversDep = Pick<
  TSecretAccessApprovalBridgeServiceFactoryDep,
  | "userDAL"
  | "userGroupMembershipDAL"
  | "projectDAL"
  | "projectSlackConfigDAL"
  | "kmsService"
  | "microsoftTeamsService"
  | "projectMicrosoftTeamsConfigDAL"
  | "notificationService"
  | "smtpService"
>;

export const notifySecretAccessStepApprovers = async (
  {
    step,
    request,
    project,
    requestedByUser,
    data
  }: {
    step: ApprovalPolicyStep;
    request: TSecretAccessRequestRow;
    project: { id: string; name: string; orgId: string };
    requestedByUser: { firstName?: string | null; lastName?: string | null; email?: string | null };
    data: TSecretAccessRequestData;
  },
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
  }: TNotifySecretAccessStepApproversDep
) => {
  const cfg = getConfig();
  const approverUserIds = await resolveStepApproverUserIds(step, userGroupMembershipDAL);
  const approverUsers = approverUserIds.size ? await userDAL.find({ $in: { id: [...approverUserIds] } }) : [];

  const requesterFullName = request.requesterName;
  const projectPath = `/organizations/${project.orgId}/projects/secret-management/${project.id}`;
  const approvalPath = `${projectPath}/approval?selectedTab=resource-requests&requestId=${encodeURIComponent(request.id)}`;
  const approvalUrl = `${cfg.SITE_URL}${approvalPath}`;
  const accessTypes = Array.isArray(data.permissions)
    ? (data.permissions as unknown[][]).map((permission) => String(permission[0]))
    : [];

  try {
    await triggerWorkflowIntegrationNotification({
      input: {
        notification: {
          type: TriggerFeature.ACCESS_REQUEST,
          payload: {
            projectName: project.name,
            projectPath,
            requesterFullName,
            isTemporary: data.isTemporary,
            requesterEmail: request.requesterEmail,
            secretPath: data.secretPath,
            environment: data.envSlug,
            permissions: accessTypes,
            approvalUrl,
            note: request.justification ?? undefined
          }
        },
        projectId: project.id
      },
      dependencies: {
        projectDAL,
        projectSlackConfigDAL,
        kmsService,
        microsoftTeamsService,
        projectMicrosoftTeamsConfigDAL
      }
    });

    await notificationService.createUserNotifications(
      approverUsers.map((approver) => ({
        userId: approver.id,
        orgId: request.organizationId,
        type: NotificationType.ACCESS_APPROVAL_REQUEST,
        title: "Access Approval Request",
        body: `**${requesterFullName}** (${requestedByUser.email}) has requested ${data.isTemporary ? "temporary" : "permanent"} access to **${data.secretPath}** in the **${data.envSlug}** environment for project **${project.name}**.`,
        link: approvalPath
      }))
    );

    const recipients = approverUsers.filter((approver) => approver.email).map((approver) => approver.email!);
    if (recipients.length) {
      await smtpService.sendMail({
        recipients,
        subjectLine: "Access Approval Request",
        substitutions: {
          projectName: project.name,
          requesterFullName,
          requesterEmail: requestedByUser.email,
          isTemporary: data.isTemporary,
          ...(data.isTemporary && data.temporaryRange && { expiresIn: msFn(ms(data.temporaryRange), { long: true }) }),
          secretPath: data.secretPath,
          environment: data.envSlug,
          permissions: accessTypes,
          approvalUrl,
          note: request.justification ?? undefined
        },
        template: SmtpTemplates.AccessApprovalRequest
      });
    }
  } catch (error) {
    logger.error(error, `Failed to notify access request approvers [requestId=${request.id}]`);
  }
};

type TSecretAccessPolicyRow = Awaited<
  ReturnType<TSecretAccessApprovalBridgeDALFactory["findSecretAccessPolicies"]>
>[number];
type TApprovalWithRequestId = Awaited<
  ReturnType<TSecretAccessApprovalBridgeDALFactory["findApprovalsByRequestIds"]>
>[number];

export type TSecretAccessRequestListInput = {
  requests: TApprovalRequests[];
  policies: TSecretAccessPolicyRow[];
  grants: TApprovalRequestGrants[];
  privileges: TAdditionalPrivileges[];
  approvals: TApprovalWithRequestId[];
  groupMembers: { groupId: string; userId: string }[];
  users: Pick<TUsers, "id" | "email" | "username" | "firstName" | "lastName">[];
  orgMemberships: { actorUserId?: string | null; isActive: boolean }[];
};

export type TPolicySubject = { type: string; id?: string | null };

export const isGroupSubject = (subject: TPolicySubject) => subject.type === ApproverType.Group;

export const collectSecretAccessPolicyGroupIds = (policies: TSecretAccessPolicyRow[]) => [
  ...new Set(
    policies
      .flatMap((policy) => [...policy.approvers, ...policy.bypassers])
      .filter(isGroupSubject)
      .map((subject) => subject.id)
      .filter((id): id is string => Boolean(id))
  )
];

export const isPolicySubjectMatch = (subjects: TPolicySubject[], actorId: string, actorGroupIds: Set<string>) =>
  subjects.some((subject) => {
    if (!subject.id) return false;
    return isGroupSubject(subject) ? actorGroupIds.has(subject.id) : subject.id === actorId;
  });

export const collectSecretAccessRequestUserIds = ({
  requests,
  policies,
  grants,
  approvals,
  groupMembers
}: Pick<TSecretAccessRequestListInput, "requests" | "policies" | "grants" | "approvals" | "groupMembers">) => {
  const userIds = new Set<string>();
  requests.forEach((request) => {
    if (request.requesterId) userIds.add(request.requesterId);
  });
  grants.forEach((grant) => {
    if (grant.revokedByUserId) userIds.add(grant.revokedByUserId);
  });
  approvals.forEach((approval) => userIds.add(approval.approverUserId));
  policies.forEach((policy) => {
    policy.approvers.forEach((approver) => {
      if (!isGroupSubject(approver) && approver.id) userIds.add(approver.id);
    });
  });
  groupMembers.forEach((member) => userIds.add(member.userId));
  return [...userIds];
};

export const composeSecretAccessRequestRows = ({
  requests,
  policies,
  grants,
  privileges,
  approvals,
  groupMembers,
  users,
  orgMemberships
}: TSecretAccessRequestListInput) => {
  const policiesById = new Map(policies.map((policy) => [policy.id, policy]));
  const userById = new Map(users.map((user) => [user.id, user]));
  const privilegeByGrantId = new Map(privileges.map((privilege) => [privilege.grantId as string, privilege]));
  const isOrgMembershipActive = new Map(
    orgMemberships.map((membership) => [membership.actorUserId as string, membership.isActive])
  );

  const grantByRequestId = new Map<string, TApprovalRequestGrants>();
  grants.forEach((grant) => {
    if (grant.requestId && !grantByRequestId.has(grant.requestId)) grantByRequestId.set(grant.requestId, grant);
  });

  const approvalsByRequestId = new Map<string, TApprovalWithRequestId[]>();
  approvals.forEach((approval) => {
    approvalsByRequestId.set(approval.requestId, [...(approvalsByRequestId.get(approval.requestId) ?? []), approval]);
  });

  const userIdsByGroupId = new Map<string, string[]>();
  groupMembers.forEach((member) => {
    userIdsByGroupId.set(member.groupId, [...(userIdsByGroupId.get(member.groupId) ?? []), member.userId]);
  });
  const expandSubject = (subject: TPolicySubject) => {
    if (!subject.id) return [];
    return isGroupSubject(subject) ? (userIdsByGroupId.get(subject.id) ?? []) : [subject.id];
  };

  const toUser = (userId: string | null | undefined) => {
    if (!userId) return null;
    const user = userById.get(userId);
    return {
      userId,
      email: user?.email ?? null,
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
      username: user?.username ?? ""
    };
  };

  return requests.map((request) => {
    const policy = request.policyId ? policiesById.get(request.policyId) : undefined;
    const grant = grantByRequestId.get(request.id) ?? null;
    const privilege = grant ? privilegeByGrantId.get(grant.id) : undefined;
    const requestApprovals = approvalsByRequestId.get(request.id) ?? [];
    const lastApproval = requestApprovals.filter((a) => a.decision === "approved").at(-1);

    const approvers = (policy?.approvers ?? []).flatMap((approver) =>
      expandSubject(approver).map((userId) => ({
        userId,
        sequence: approver.sequence ?? 1,
        approvalsRequired: approver.approvalsRequired ?? 1,
        email: userById.get(userId)?.email ?? null,
        username: userById.get(userId)?.username ?? "",
        isOrgMembershipActive: isOrgMembershipActive.get(userId) ?? false
      }))
    );
    const bypassers = (policy?.bypassers ?? []).flatMap(expandSubject);

    return {
      request,
      grant,
      privilegeId: privilege?.id ?? null,
      privilege: privilege
        ? {
            membershipId: privilege.projectId ?? "",
            userId: privilege.actorUserId ?? "",
            projectId: privilege.projectId ?? "",
            isTemporary: privilege.isTemporary,
            temporaryMode: privilege.temporaryMode,
            temporaryRange: privilege.temporaryRange,
            temporaryAccessStartTime: privilege.temporaryAccessStartTime,
            temporaryAccessEndTime: privilege.temporaryAccessEndTime,
            permissions: privilege.permissions
          }
        : null,
      policy: policy
        ? {
            id: policy.id,
            name: policy.name,
            approvals: policy.approvals,
            secretPath: policy.secretPath,
            enforcementLevel: policy.enforcementLevel,
            allowedSelfApprovals: policy.allowedSelfApprovals,
            envId: policy.envId,
            deletedAt: null,
            maxTimePeriod: policy.maxTimePeriod,
            requestExpirationTime: policy.requestExpirationTime,
            approvers,
            bypassers
          }
        : null,
      environment: policy?.environment ?? null,
      requestedByUser: toUser(request.requesterId),
      approvedByUser: toUser(lastApproval?.approverUserId),
      revokedByUser: toUser(grant?.revokedByUserId),
      reviewers: requestApprovals.map((approval) => ({
        userId: approval.approverUserId,
        status: approval.decision,
        isOrgMembershipActive: isOrgMembershipActive.get(approval.approverUserId) ?? false
      }))
    };
  });
};
