import { Knex } from "knex";

import { RESOURCE_SCOPE, ResourceType, TApprovalRequestGrants } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ResourcePermissionApprovalPolicyActions,
  ResourcePermissionPamResourceActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { formatDuration, ms } from "@app/lib/ms";
import { TriggerFeature } from "@app/lib/workflow-integrations/types";
import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import {
  ApprovalAuditAction,
  ApprovalNotificationEvent,
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApprovalRequestApprovalDecision,
  ApprovalRequestGrantStatus,
  ApprovalRequestStatus,
  ApproverType
} from "@app/services/approval-policy/approval-policy-enums";
import { PolicyBypasser, TApprovalActor, TApprovalResource } from "@app/services/approval-policy/approval-policy-types";
import {
  TApprovalRequestDALFactory,
  TApprovalRequestGrantsDALFactory
} from "@app/services/approval-policy/approval-request-dal";
import {
  matchesPamAccessSubject,
  matchPamAccessGrants,
  PAM_DEFAULT_ACCESS_TYPE,
  parsePamAccessDuration
} from "@app/services/approval-policy/pam-access/pam-access-policy-fns";
import {
  TPamAccessPolicy,
  TPamAccessPolicyInputs
} from "@app/services/approval-policy/pam-access/pam-access-policy-types";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { NotificationType } from "@app/services/notification/notification-types";
import { SmtpTemplates } from "@app/services/smtp/smtp-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";
import { TUserDALFactory } from "@app/services/user/user-dal";

import {
  PamAccessType,
  PamAccountType,
  PamNotificationEvent,
  PamProductRole,
  PamSessionStatus
} from "../pam/pam-enums";
import {
  checkAccountAccess,
  checkFolderPermission,
  TActorContext,
  verifyProductMembership
} from "../pam/pam-permission";
import { resolveAccessControls } from "../pam/pam-policies";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import {
  hasRevealableCredential,
  noRevealableCredentialMessage,
  normalizeCredentialAuthMethod
} from "../pam-account/pam-account-schemas";
import { TPamAccountTemplateDALFactory } from "../pam-account-template/pam-account-template-dal";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { terminatePamSessions } from "../pam-session/pam-session-fns";
import { escapeMarkdown, getSlackSendTargets } from "./pam-access-request-fns";
import { TPamAccessRequestData } from "./pam-access-request-types";
import { TPamFolderNotificationConfigDALFactory } from "./pam-folder-notification-config-dal";

type TPamAccessApprovalResourceDep = {
  approvalPolicyDAL: Pick<
    TApprovalPolicyDALFactory,
    "findStepsByPolicyId" | "findByProjectId" | "findBypassersByPolicyId" | "findById"
  >;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "findGroupMembershipsByUserIdInOrg">;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "find">;
  approvalRequestGrantsDAL: Pick<TApprovalRequestGrantsDALFactory, "find" | "create" | "updateById">;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findByIdWithDetails" | "find">;
  pamAccountTemplateDAL: Pick<TPamAccountTemplateDALFactory, "find">;
  pamFolderDAL: Pick<TPamFolderDALFactory, "findById" | "find">;
  pamSessionDAL: Pick<TPamSessionDALFactory, "find" | "update">;
  membershipDAL: Pick<TMembershipDALFactory, "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  userDAL: Pick<TUserDALFactory, "findById">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  pamFolderNotificationConfigDAL: Pick<TPamFolderNotificationConfigDALFactory, "findByFolderIdWithIntegration">;
};

type TPamRequestDecoration = {
  accountName: string | null;
  accountType: string | null;
  folderName: string | null;
  accessType: PamAccessType;
};

export type TPamAccessApprovalResource = TApprovalResource<
  TPamAccessPolicyInputs,
  TPamAccessPolicy,
  TPamAccessRequestData
> & {
  assertBreakGlassEligible: (args: TBreakGlassSubject) => Promise<void>;
  decorateRequests: <T extends { requestData?: unknown }>(requests: T[]) => Promise<(T & TPamRequestDecoration)[]>;
  findActiveFolderMemberships: (
    projectId: string,
    folderId: string
  ) => Promise<Awaited<ReturnType<TMembershipDALFactory["find"]>>>;
  revokeGrantRow: (
    grant: TApprovalRequestGrants,
    actorId: string,
    reason: string,
    tx?: Knex
  ) => Promise<{ revoked: TApprovalRequestGrants; sendCancellationSignals: () => void }>;
};

const toActorContext = (actor: TApprovalActor): TActorContext => ({
  actorId: actor.id,
  actor: actor.type,
  actorOrgId: actor.orgId,
  actorAuthMethod: actor.authMethod
});

type TBreakGlassSubject = {
  projectId: string;
  accountId?: string;
  folderId?: string;
  accessType?: PamAccessType;
  actor: TApprovalActor;
};

const requestDataOf = (request: { requestData?: unknown }) =>
  (request.requestData as { version: number; requestData: TPamAccessRequestData } | null)?.requestData ?? null;

// Everything PAM-specific about its approvals; the lifecycle itself lives in approval-policy-service
export const pamAccessApprovalResourceFactory = ({
  approvalPolicyDAL,
  userGroupMembershipDAL,
  approvalRequestDAL,
  approvalRequestGrantsDAL,
  pamAccountDAL,
  pamAccountTemplateDAL,
  pamFolderDAL,
  pamSessionDAL,
  membershipDAL,
  membershipRoleDAL,
  permissionService,
  userDAL,
  gatewayV2Service,
  kmsService,
  licenseService,
  pamFolderNotificationConfigDAL
}: TPamAccessApprovalResourceDep): TPamAccessApprovalResource => {
  const $assertFolderInProject = async (folderId: string, projectId: string) => {
    const folder = await pamFolderDAL.findById(folderId);
    if (!folder || folder.projectId !== projectId) {
      throw new NotFoundError({ message: "Folder not found" });
    }
    return folder;
  };

  // Temporary membership expiry is enforced lazily (rows are not deleted when access lapses), so
  // approver eligibility must filter to memberships that still carry an active role.
  const findActiveFolderMemberships = async (projectId: string, folderId: string) => {
    const memberships = await membershipDAL.find({
      scope: RESOURCE_SCOPE,
      scopeProjectId: projectId,
      scopeResourceType: ResourceType.PamFolder,
      scopeResourceId: folderId
    });
    if (!memberships.length) return [];

    const roles = await membershipRoleDAL.find({ $in: { membershipId: memberships.map((m) => m.id) } });
    const now = new Date();
    const isWithinTemporaryWindow = (r: (typeof roles)[number]) =>
      Boolean(r.temporaryAccessEndTime) &&
      now < new Date(r.temporaryAccessEndTime as Date) &&
      (!r.temporaryAccessStartTime || now >= new Date(r.temporaryAccessStartTime));
    const activeMembershipIds = new Set(
      roles.filter((r) => !r.isTemporary || isWithinTemporaryWindow(r)).map((r) => r.membershipId)
    );
    return memberships.filter((m) => m.isActive && activeMembershipIds.has(m.id));
  };

  const $holdsActiveFolderMembership = async (
    projectId: string,
    folderId: string,
    userId: string,
    userGroupIds: Set<string>
  ) => {
    const memberships = await findActiveFolderMemberships(projectId, folderId);
    return memberships.some((m) => m.actorUserId === userId || (m.actorGroupId && userGroupIds.has(m.actorGroupId)));
  };

  const $namesActor = (entries: { type: string; id: string }[], userId: string, userGroupIds: Set<string>) =>
    entries.some(
      (entry) =>
        (entry.type === ApproverType.User && entry.id === userId) ||
        (entry.type === ApproverType.Group && userGroupIds.has(entry.id))
    );

  const $findFolderPolicy = async (projectId: string, folderId: string) => {
    const policies = await approvalPolicyDAL.findByProjectId(ApprovalPolicyType.PamAccess, projectId, {
      scopeType: ApprovalPolicyScope.PamFolder,
      scopeId: folderId
    });
    return policies[0] ?? null;
  };

  const matchPolicy: TPamAccessApprovalResource["matchPolicy"] = async (projectId, inputs) => {
    if (!inputs.folderId) return null;
    return ((await $findFolderPolicy(projectId, inputs.folderId)) as TPamAccessPolicy) ?? null;
  };

  // An actor id is unique across both grantee columns, so querying each cannot cross-match.
  const canAccess: TPamAccessApprovalResource["canAccess"] = async (projectId, actorId, inputs) => {
    const [userGrants, identityGrants] = await Promise.all([
      approvalRequestGrantsDAL.find({
        granteeUserId: actorId,
        type: ApprovalPolicyType.PamAccess,
        status: ApprovalRequestGrantStatus.Active,
        projectId,
        revokedAt: null
      }),
      approvalRequestGrantsDAL.find({
        granteeMachineIdentityId: actorId,
        type: ApprovalPolicyType.PamAccess,
        status: ApprovalRequestGrantStatus.Active,
        projectId,
        revokedAt: null
      })
    ]);

    const now = new Date();
    return (
      matchPamAccessGrants([...userGrants, ...identityGrants], inputs).find(
        (grant) => !grant.expiresAt || new Date(grant.expiresAt) > now
      ) ?? null
    );
  };

  const matchesInputs: NonNullable<TPamAccessApprovalResource["matchesInputs"]> = (payload, inputs) => {
    const target = inputs as TPamAccessPolicyInputs;
    if (target.accessType) return matchesPamAccessSubject(payload, target);

    return (payload as { accountId?: string } | null)?.accountId === target.accountId;
  };

  const validateConstraints: TPamAccessApprovalResource["validateConstraints"] = (policy, requestData) => {
    const requestedMs = parsePamAccessDuration(requestData.duration);
    if (requestedMs === null) {
      return {
        valid: false,
        errors: [`Invalid access duration '${requestData.duration}'. Use a single unit like '30m', '2h', or '1d'`]
      };
    }

    const { min, max } = policy.constraints.constraints.accessDuration;
    const errors: string[] = [];
    if (requestedMs < ms(min)) errors.push(`Access duration must be at least ${min}`);
    if (requestedMs > ms(max)) errors.push(`Access duration must be at most ${max}`);

    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  };

  const postApprovalTxRoutine: NonNullable<TPamAccessApprovalResource["postApprovalTxRoutine"]> = async (
    request,
    tx,
    breakGlass
  ) => {
    const inputs = request.requestData.requestData as TPamAccessRequestData;
    const durationMs = parsePamAccessDuration(inputs.duration);

    const grant = await approvalRequestGrantsDAL.create(
      {
        projectId: request.projectId,
        requestId: request.id,
        // The request attributes its requester to exactly one column; mirror it onto the grant
        granteeUserId: request.requesterId,
        granteeMachineIdentityId: request.machineIdentityId,
        status: ApprovalRequestGrantStatus.Active,
        type: request.type,
        attributes: {
          accountId: inputs.accountId,
          folderId: inputs.folderId,
          accessType: inputs.accessType ?? PAM_DEFAULT_ACCESS_TYPE
        },
        expiresAt: durationMs === null ? null : new Date(Date.now() + durationMs),
        isBreakGlass: Boolean(breakGlass),
        bypassReason: breakGlass?.bypassReason ?? null
      },
      tx
    );

    return { grantId: grant.id };
  };

  const resolveScope = async (folderId: string) => {
    const folder = await pamFolderDAL.findById(folderId);
    if (!folder) {
      throw new NotFoundError({ message: "Folder not found" });
    }
    return { projectId: folder.projectId };
  };

  const assertCanManagePolicy: NonNullable<TPamAccessApprovalResource["assertCanManagePolicy"]> = async ({
    projectId,
    scopeId,
    actor,
    action
  }) => {
    if (!scopeId) {
      throw new BadRequestError({ message: "PAM approval policies must be scoped to a folder" });
    }

    const ctx = toActorContext(actor);
    await verifyProductMembership(permissionService, projectId, ctx);
    await $assertFolderInProject(scopeId, projectId);

    const { permission } = await checkFolderPermission(permissionService, scopeId, projectId, ctx);
    const canManage = permission.can(
      ResourcePermissionPamResourceActions.ManagePolicies,
      ResourcePermissionSub.PamResource
    );

    if (canManage) return;

    const isRead = action === ResourcePermissionApprovalPolicyActions.Read;
    const canAudit = permission.can(
      ResourcePermissionPamResourceActions.ViewAuditLogs,
      ResourcePermissionSub.PamResource
    );
    if (isRead && canAudit) return;

    throw new ForbiddenRequestError({
      message: isRead
        ? "You are not authorized to view this folder's approval configuration"
        : "You are not authorized to manage this folder's approval configuration"
    });
  };

  const canReadScope: NonNullable<TPamAccessApprovalResource["canReadScope"]> = async ({
    projectId,
    scopeId,
    actor
  }) => {
    if (!scopeId) return false;

    try {
      const { permission } = await checkFolderPermission(permissionService, scopeId, projectId, toActorContext(actor));
      return (
        permission.can(ResourcePermissionPamResourceActions.ManagePolicies, ResourcePermissionSub.PamResource) ||
        permission.can(ResourcePermissionPamResourceActions.ViewAuditLogs, ResourcePermissionSub.PamResource)
      );
    } catch {
      return false;
    }
  };

  const verifyPolicyActors: NonNullable<TPamAccessApprovalResource["verifyPolicyActors"]> = async ({
    projectId,
    scopeId,
    approvers,
    bypassers
  }) => {
    if (!scopeId || (approvers.length === 0 && bypassers.length === 0)) return;

    const memberships = await findActiveFolderMemberships(projectId, scopeId);
    const memberUserIds = new Set(memberships.map((m) => m.actorUserId).filter(Boolean));
    const memberGroupIds = new Set(memberships.map((m) => m.actorGroupId).filter(Boolean));
    const isFolderMember = (entry: PolicyBypasser) =>
      entry.type === ApproverType.User ? memberUserIds.has(entry.id) : memberGroupIds.has(entry.id);

    if (approvers.some((approver) => !isFolderMember(approver))) {
      throw new BadRequestError({ message: "Approvers must be members of the folder" });
    }

    if (bypassers.some((bypasser) => !isFolderMember(bypasser))) {
      throw new BadRequestError({ message: "Break-glass users must be members of the folder" });
    }
  };

  const assertCanCreateRequest: NonNullable<TPamAccessApprovalResource["assertCanCreateRequest"]> = async ({
    projectId,
    policy,
    requestData,
    actor
  }) => {
    const inputs = requestData as TPamAccessRequestData;
    const ctx = toActorContext(actor);
    const isCredentialRequest = inputs.accessType === PamAccessType.Credential;

    await verifyProductMembership(permissionService, projectId, ctx);

    const account = await pamAccountDAL.findByIdWithDetails(inputs.accountId);
    if (!account || account.projectId !== projectId || account.folderId !== inputs.folderId) {
      throw new NotFoundError({ message: "Account not found" });
    }

    // Approval is a layer on top of standing access: only users who already hold the underlying
    // permission may request the temporary grant that unlocks it.
    await checkAccountAccess(
      permissionService,
      account.id,
      account.folderId,
      projectId,
      isCredentialRequest
        ? ResourcePermissionPamResourceActions.ViewCredentials
        : ResourcePermissionPamResourceActions.LaunchSessions,
      ctx
    );

    const accessControls = resolveAccessControls(account.templatePolicies);
    if (!accessControls.requiresApproval) {
      throw new BadRequestError({
        message: isCredentialRequest
          ? "This account does not require approval to view its credentials"
          : "This account does not require approval"
      });
    }

    if (isCredentialRequest) {
      const { decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      const credentials = normalizeCredentialAuthMethod(
        account.accountType as PamAccountType,
        JSON.parse(decryptor({ cipherTextBlob: account.encryptedCredentials }).toString("utf-8")) as Record<
          string,
          unknown
        >
      );
      if (!hasRevealableCredential(account.accountType as PamAccountType, credentials)) {
        throw new BadRequestError({ message: noRevealableCredentialMessage(account.name) });
      }
    }

    if (accessControls.requireReason && !inputs.reason) {
      throw new BadRequestError({
        name: "PAM_REASON_REQUIRED",
        message: isCredentialRequest
          ? "A reason is required to request credential access to this account"
          : "A reason is required to request access to this account"
      });
    }

    const policySteps = await approvalPolicyDAL.findStepsByPolicyId(policy.id);
    if (policySteps.length === 0 || policySteps.some((step) => step.approvers.length === 0)) {
      throw new BadRequestError({
        message:
          "This folder's approval policy has no approvers configured. Ask a folder admin to add approvers under the folder's Approvals tab, then submit your request again."
      });
    }

    // Dedupe per (account, access type), so a session request isn't blocked by a pending credential one.
    const pending = await approvalRequestDAL.find({
      ...(actor.type === ActorType.IDENTITY ? { machineIdentityId: actor.id } : { requesterId: actor.id }),
      type: ApprovalPolicyType.PamAccess,
      status: ApprovalRequestStatus.Pending,
      projectId
    });

    const hasPendingForAccount = pending.some((request) => {
      const data = requestDataOf(request);
      return (
        data?.accountId === inputs.accountId &&
        (data?.accessType ?? PamAccessType.Session) === (inputs.accessType ?? PamAccessType.Session)
      );
    });

    if (hasPendingForAccount) {
      throw new BadRequestError({
        message: isCredentialRequest
          ? "You already have a pending credential request for this account"
          : "You already have a pending request for this account"
      });
    }
  };

  const assertCanReview: NonNullable<TPamAccessApprovalResource["assertCanReview"]> = async ({
    request,
    decision,
    actor,
    userGroupIds
  }) => {
    // Self-approval is a conflict of interest and always blocked
    if (decision === ApprovalRequestApprovalDecision.Approved && request.requesterId === actor.id) {
      throw new ForbiddenRequestError({ message: "You cannot approve your own request" });
    }

    const inputs = requestDataOf(request);
    const folderId = inputs?.folderId;

    if (decision === ApprovalRequestApprovalDecision.Approved) {
      const account = inputs?.accountId ? await pamAccountDAL.findByIdWithDetails(inputs.accountId) : null;
      if (!account || account.projectId !== request.projectId || account.folderId !== folderId) {
        throw new BadRequestError({
          message: "This request is no longer valid because the account has moved or been removed"
        });
      }
    }

    if (!folderId) return;

    const currentPolicy = await $findFolderPolicy(request.projectId, folderId);
    if (!currentPolicy) {
      throw new ForbiddenRequestError({ message: "Approval policy no longer exists for this folder" });
    }

    const currentSteps = await approvalPolicyDAL.findStepsByPolicyId(currentPolicy.id);
    const isCurrentApprover = currentSteps.some((step) => $namesActor(step.approvers, actor.id, userGroupIds));
    if (!isCurrentApprover) {
      throw new ForbiddenRequestError({ message: "You are no longer an eligible approver for this folder" });
    }

    if (!(await $holdsActiveFolderMembership(request.projectId, folderId, actor.id, userGroupIds))) {
      throw new ForbiddenRequestError({ message: "You are no longer an eligible approver for this folder" });
    }
  };

  const $refuseBreakGlass = async ({
    projectId,
    accountId,
    folderId,
    accessType,
    bypassers,
    actor,
    userGroupIds
  }: TBreakGlassSubject & { bypassers: PolicyBypasser[]; userGroupIds: Set<string> }): Promise<Error | null> => {
    if (actor.type !== ActorType.USER) {
      return new ForbiddenRequestError({ message: "Only users can break glass on an access request" });
    }

    if (!accountId || !folderId) {
      return new BadRequestError({ message: "This request is missing the account it was raised for" });
    }

    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.projectId !== projectId || account.folderId !== folderId) {
      return new BadRequestError({
        message: "This request is no longer valid because the account has moved or been removed"
      });
    }

    if (!resolveAccessControls(account.templatePolicies).allowBreakGlass) {
      return new ForbiddenRequestError({
        message: `Break-glass is not enabled for '${account.name}'. Ask a PAM admin to turn on the Allow Break-Glass policy on its template.`
      });
    }

    if (!$namesActor(bypassers, actor.id, userGroupIds)) {
      return new ForbiddenRequestError({ message: "You are not a break-glass user for this folder" });
    }

    if (!(await $holdsActiveFolderMembership(projectId, folderId, actor.id, userGroupIds))) {
      return new ForbiddenRequestError({ message: "You are not a member of this folder" });
    }

    try {
      await checkAccountAccess(
        permissionService,
        account.id,
        folderId,
        projectId,
        accessType === PamAccessType.Credential
          ? ResourcePermissionPamResourceActions.ViewCredentials
          : ResourcePermissionPamResourceActions.LaunchSessions,
        toActorContext(actor)
      );
    } catch (err) {
      return err as Error;
    }

    return null;
  };

  const assertBreakGlassEligible = async ({
    projectId,
    accountId,
    folderId,
    accessType,
    actor
  }: TBreakGlassSubject) => {
    const policy = folderId ? await $findFolderPolicy(projectId, folderId) : null;
    if (!policy) {
      throw new ForbiddenRequestError({ message: "Approval policy no longer exists for this folder" });
    }

    const [bypassers, userGroupMemberships] = await Promise.all([
      approvalPolicyDAL.findBypassersByPolicyId(policy.id),
      userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(actor.id, actor.orgId)
    ]);

    const refusal = await $refuseBreakGlass({
      projectId,
      accountId,
      folderId,
      accessType,
      actor,
      bypassers,
      userGroupIds: new Set(userGroupMemberships.map((g) => g.groupId))
    });
    if (refusal) throw refusal;
  };

  const isBreakGlassEligible: NonNullable<TPamAccessApprovalResource["isBreakGlassEligible"]> = async ({
    request,
    bypassers,
    actor,
    userGroupIds
  }) => {
    const inputs = requestDataOf(request);
    return !(await $refuseBreakGlass({
      projectId: request.projectId,
      accountId: inputs?.accountId,
      folderId: inputs?.folderId,
      accessType: inputs?.accessType,
      actor,
      bypassers,
      userGroupIds
    }));
  };

  const assertCanRevokeGrant: NonNullable<TPamAccessApprovalResource["assertCanRevokeGrant"]> = async ({
    grant,
    request,
    actor
  }) => {
    const ctx = toActorContext(actor);
    const { hasRole } = await verifyProductMembership(permissionService, grant.projectId, ctx);

    const accountId = request ? requestDataOf(request)?.accountId : undefined;
    const account = accountId ? await pamAccountDAL.findByIdWithDetails(accountId) : null;

    if (account && account.projectId === grant.projectId) {
      await checkAccountAccess(
        permissionService,
        account.id,
        account.folderId,
        grant.projectId,
        ResourcePermissionPamResourceActions.RevokeGrants,
        ctx
      );
      return;
    }

    if (!hasRole(PamProductRole.Admin)) {
      throw new ForbiddenRequestError({ message: "You are not authorized to revoke this approval" });
    }
  };

  // Terminates the grantee's live sessions on the granted account
  const onGrantRevoked = async ({
    grant,
    actorId,
    tx
  }: {
    grant: TApprovalRequestGrants;
    actorId: string;
    tx?: Knex;
  }): Promise<() => void> => {
    const noSignals = () => {};

    let granteeFilter: { userId: string } | { identityId: string } | null = null;
    if (grant.granteeMachineIdentityId) granteeFilter = { identityId: grant.granteeMachineIdentityId };
    else if (grant.granteeUserId) granteeFilter = { userId: grant.granteeUserId };

    const attrs = grant.attributes as { accountId?: string; accessType?: PamAccessType } | null;
    if (!attrs?.accountId || !granteeFilter) return noSignals;

    if ((attrs.accessType ?? PamAccessType.Session) === PamAccessType.Credential) return noSignals;

    const liveSessions = await pamSessionDAL.find(
      {
        accountId: attrs.accountId,
        ...granteeFilter,
        $in: { status: [PamSessionStatus.Active, PamSessionStatus.Starting] }
      },
      { tx }
    );
    if (liveSessions.length === 0) return noSignals;

    const actor = await userDAL.findById(actorId, tx);
    return terminatePamSessions({
      sessions: liveSessions,
      actorId,
      actorEmail: actor?.email ?? "",
      pamSessionDAL,
      gatewayV2Service,
      tx
    });
  };

  const $chatDeliveries = async (event: PamNotificationEvent, orgId: string, folderId: string) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.pamSlackNotifications) return [];

    const configs = await pamFolderNotificationConfigDAL.findByFolderIdWithIntegration(folderId);
    return getSlackSendTargets(configs, event);
  };

  const buildNotification: NonNullable<TPamAccessApprovalResource["buildNotification"]> = async ({
    event,
    request,
    comment,
    bypassReason
  }) => {
    const inputs = requestDataOf(request);
    if (!inputs?.folderId) return null;

    const [account, folder] = await Promise.all([
      inputs.accountId ? pamAccountDAL.findByIdWithDetails(inputs.accountId) : null,
      pamFolderDAL.findById(inputs.folderId)
    ]);

    const accountName = account?.name ?? "a PAM account";
    const folderName = folder?.name ?? "";
    const orgId = request.organizationId;
    const cfg = getConfig();
    const accessTypeLabel = inputs.accessType === PamAccessType.Credential ? "credential access" : "access";
    const requesterName = request.requesterName || "A user";
    // Machine identities have no email; the label stands in so the template renders something.
    const requesterEmail = request.requesterEmail || "Machine Identity";
    const accountsUrl = `${cfg.SITE_URL}/organizations/${orgId}/pam/accounts`;

    if (event === ApprovalNotificationEvent.Requested) {
      const approvalUrl = `${cfg.SITE_URL}/organizations/${orgId}/pam/approval-requests?requestId=${request.id}`;
      return {
        inApp: {
          type: NotificationType.APPROVAL_REQUIRED,
          title: "Approval Required",
          body: `**${requesterName}** requested ${accessTypeLabel} to **${accountName}**.`,
          link: approvalUrl
        },
        email: {
          subjectLine:
            inputs.accessType === PamAccessType.Credential ? "PAM Credential Access Request" : "PAM Access Request",
          template: SmtpTemplates.AccessPamRequest,
          substitutions: {
            requesterFullName: requesterName,
            requesterEmail,
            accountName,
            folderName: folder?.name ?? undefined,
            accessDuration: formatDuration(inputs.duration),
            accessTypeLabel,
            reason: inputs.reason,
            approvalUrl
          }
        },
        chat: (await $chatDeliveries(PamNotificationEvent.AccessRequested, orgId, inputs.folderId)).map((target) => ({
          ...target,
          notification: {
            type: TriggerFeature.PAM_ACCESS_REQUESTED,
            payload: {
              requesterFullName: requesterName,
              requesterEmail,
              accountName,
              folderName,
              accessDuration: formatDuration(inputs.duration),
              accessTypeLabel,
              reason: inputs.reason,
              approvalUrl
            }
          }
        }))
      };
    }

    if (event === ApprovalNotificationEvent.Bypassed) {
      return {
        inApp: {
          type: NotificationType.ACCESS_APPROVAL_REQUEST_UPDATED,
          title: "Access approval bypassed",
          body: `**${escapeMarkdown(requesterName)}** used break-glass to self-approve access to **${escapeMarkdown(accountName)}**. Reason: "${escapeMarkdown(bypassReason ?? "")}"`,
          link: accountsUrl
        },
        email: {
          subjectLine: "PAM Access Approval Bypassed",
          template: SmtpTemplates.AccessPamRequestBypassed,
          substitutions: {
            requesterFullName: requesterName,
            requesterEmail: request.requesterEmail ?? "",
            resourceName: folder?.name ?? undefined,
            accountName,
            accessDuration: formatDuration(inputs.duration),
            bypassReason
          }
        },
        chat: (await $chatDeliveries(PamNotificationEvent.AccessRequestBypassed, orgId, inputs.folderId)).map(
          (target) => ({
            ...target,
            notification: {
              type: TriggerFeature.PAM_ACCESS_REQUEST_BYPASSED,
              payload: {
                requesterFullName: requesterName,
                requesterEmail: request.requesterEmail ?? "",
                accountName,
                folderName,
                accessDuration: formatDuration(inputs.duration),
                bypassReason: bypassReason ?? ""
              }
            }
          })
        )
      };
    }

    // A decided request leaves the approver inbox, so its messages link to the accounts page instead
    const approved = event === ApprovalNotificationEvent.Approved;
    return {
      inApp: {
        type: NotificationType.ACCESS_APPROVAL_REQUEST_UPDATED,
        title: approved ? "Access request approved" : "Access request denied",
        body: `Your access request for **${accountName}** was ${approved ? "approved" : "denied"}.${
          comment ? ` Reviewer comment: "${comment}"` : ""
        }`,
        link: accountsUrl
      },
      chat: (
        await $chatDeliveries(
          approved ? PamNotificationEvent.AccessRequestApproved : PamNotificationEvent.AccessRequestDenied,
          orgId,
          inputs.folderId
        )
      ).map((target) => ({
        ...target,
        notification: {
          type: approved ? TriggerFeature.PAM_ACCESS_REQUEST_APPROVED : TriggerFeature.PAM_ACCESS_REQUEST_DENIED,
          payload: {
            requesterFullName: requesterName,
            requesterEmail,
            accountName,
            folderName,
            comment,
            approvalUrl: accountsUrl
          }
        }
      }))
    };
  };

  const isLiveApprover: NonNullable<TPamAccessApprovalResource["isLiveApprover"]> = async ({
    projectId,
    scopeId,
    actor,
    userGroupIds
  }) => {
    const policy = await $findFolderPolicy(projectId, scopeId);
    if (!policy) return false;

    const steps = await approvalPolicyDAL.findStepsByPolicyId(policy.id);
    if (!steps.some((step) => $namesActor(step.approvers, actor.id, userGroupIds))) return false;

    return $holdsActiveFolderMembership(projectId, scopeId, actor.id, userGroupIds);
  };

  const decorateRequests: TPamAccessApprovalResource["decorateRequests"] = async (requests) => {
    const inputs = requests.map((request) => requestDataOf(request as { requestData?: unknown }));
    const accountIds = [...new Set(inputs.map((i) => i?.accountId).filter((id): id is string => Boolean(id)))];
    const folderIds = [...new Set(inputs.map((i) => i?.folderId).filter((id): id is string => Boolean(id)))];

    const accounts = accountIds.length > 0 ? await pamAccountDAL.find({ $in: { id: accountIds } }) : [];
    const folders = folderIds.length > 0 ? await pamFolderDAL.find({ $in: { id: folderIds } }) : [];
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const folderById = new Map(folders.map((f) => [f.id, f]));

    const templateIds = [...new Set(accounts.map((a) => a.templateId).filter(Boolean))];
    const templates = templateIds.length > 0 ? await pamAccountTemplateDAL.find({ $in: { id: templateIds } }) : [];
    const templateTypeById = new Map(templates.map((t) => [t.id, t.type]));

    return requests.map((request, i) => {
      const account = inputs[i]?.accountId ? accountById.get(inputs[i]!.accountId) : null;
      const folder = inputs[i]?.folderId ? folderById.get(inputs[i]!.folderId) : null;
      return {
        ...request,
        accountName: account?.name ?? null,
        accountType: account?.templateId ? (templateTypeById.get(account.templateId) ?? null) : null,
        folderName: folder?.name ?? null,
        accessType: inputs[i]?.accessType ?? PamAccessType.Session
      };
    });
  };

  const buildTelemetryEvent: NonNullable<TPamAccessApprovalResource["buildTelemetryEvent"]> = async ({
    action,
    request,
    distinctId,
    decision
  }) => {
    const orgId = request.organizationId;
    const base = { distinctId, organizationId: orgId };

    if (action === ApprovalAuditAction.RequestReviewed) {
      return {
        ...base,
        event: PostHogEventTypes.PamAccessRequestReviewed,
        properties: { orgId, status: decision ?? "" }
      };
    }

    if (action === ApprovalAuditAction.GrantRevoked) {
      return { ...base, event: PostHogEventTypes.PamAccessGrantRevoked, properties: { orgId } };
    }

    if (action !== ApprovalAuditAction.RequestBypassed) return null;

    const accountId = requestDataOf(request)?.accountId;
    const account = accountId ? await pamAccountDAL.findByIdWithDetails(accountId) : null;
    return {
      ...base,
      event: PostHogEventTypes.PamAccessRequestBrokeGlass,
      properties: { orgId, accountType: account?.accountType ?? "" }
    };
  };

  const buildAuditEvent: NonNullable<TPamAccessApprovalResource["buildAuditEvent"]> = async ({
    action,
    request,
    grantId,
    actorId,
    comment,
    bypassReason
  }) => {
    const inputs = requestDataOf(request);
    const account = inputs?.accountId ? await pamAccountDAL.findByIdWithDetails(inputs.accountId) : null;
    const folder = inputs?.folderId ? await pamFolderDAL.findById(inputs.folderId) : null;
    const scope = {
      accountId: inputs?.accountId,
      accountName: account?.name,
      folderId: inputs?.folderId,
      folderName: folder?.name
    };

    if (action === ApprovalAuditAction.RequestCreated) {
      if (!inputs?.accountId || !inputs.folderId) return null;
      return {
        type: EventType.PAM_ACCESS_REQUEST_CREATE,
        metadata: {
          ...scope,
          accountId: inputs.accountId,
          folderId: inputs.folderId,
          requestId: request.id,
          requesterName: request.requesterName,
          requesterEmail: request.requesterEmail,
          duration: inputs.duration,
          accessType: inputs.accessType ?? PamAccessType.Session,
          reason: inputs.reason
        }
      };
    }

    if (action === ApprovalAuditAction.RequestReviewed) {
      return {
        type: EventType.PAM_ACCESS_REQUEST_REVIEW,
        metadata: {
          ...scope,
          requestId: request.id,
          requesterName: request.requesterName,
          requesterEmail: request.requesterEmail,
          status: request.status,
          comment
        }
      };
    }

    if (action === ApprovalAuditAction.GrantRevoked && grantId) {
      return {
        type: EventType.PAM_ACCESS_GRANT_REVOKE,
        metadata: {
          ...scope,
          requestId: request.id,
          grantId,
          granteeName: request.requesterName,
          granteeEmail: request.requesterEmail
        }
      };
    }

    if (action !== ApprovalAuditAction.RequestBypassed || !grantId) return null;

    const policy = request.policyId ? await approvalPolicyDAL.findById(request.policyId) : null;
    const steps = request.policyId ? await approvalPolicyDAL.findStepsByPolicyId(request.policyId) : [];

    return {
      type: EventType.PAM_ACCESS_POLICY_BYPASSED,
      metadata: {
        policyType: ApprovalPolicyType.PamAccess,
        policyId: policy?.id ?? null,
        policyName: policy?.name,
        requestId: request.id,
        grantId,
        granteeUserId: actorId,
        granteeName: request.requesterName ?? undefined,
        granteeEmail: request.requesterEmail ?? undefined,
        ...scope,
        resourceName: folder?.name,
        accessDuration: inputs?.duration ?? "",
        bypassReason: bypassReason ?? "",
        approverCount: new Set(steps.flatMap((step) => step.approvers.map((a) => `${a.type}:${a.id}`))).size
      }
    };
  };

  const filterActiveApprovers: NonNullable<TPamAccessApprovalResource["filterActiveApprovers"]> = async (
    request,
    approvers
  ) => {
    const folderId = requestDataOf(request)?.folderId;
    if (!folderId || approvers.length === 0) return approvers;

    const memberships = await findActiveFolderMemberships(request.projectId, folderId);
    const activeKeys = new Set([
      ...memberships.filter((m) => m.actorUserId).map((m) => `${ApproverType.User}:${m.actorUserId}`),
      ...memberships.filter((m) => m.actorGroupId).map((m) => `${ApproverType.Group}:${m.actorGroupId}`)
    ]);

    return approvers.filter((approver) => activeKeys.has(`${approver.type}:${approver.id}`));
  };

  const revokeGrantRow = async (grant: TApprovalRequestGrants, actorId: string, reason: string, tx?: Knex) => {
    const revoked = await approvalRequestGrantsDAL.updateById(
      grant.id,
      {
        status: ApprovalRequestGrantStatus.Revoked,
        revokedByUserId: actorId,
        revokedAt: new Date(),
        revocationReason: reason
      },
      tx
    );

    return { revoked, sendCancellationSignals: await onGrantRevoked({ grant, actorId, tx }) };
  };

  return {
    matchPolicy,
    canAccess,
    matchesInputs,
    buildNotification,
    buildAuditEvent,
    buildTelemetryEvent,
    decorateRequests,
    filterActiveApprovers,
    isLiveApprover,
    validateConstraints,
    postApprovalTxRoutine,
    resolveScope,
    noMatchingPolicyMessage: "No approval configuration found for this folder",
    assertCanManagePolicy,
    canReadScope,
    singlePolicyPerScope: true,
    verifyPolicyActors,
    assertCanCreateRequest,
    assertCanReview,
    isBreakGlassEligible,
    assertBreakGlassEligible,
    assertCanRevokeGrant,
    onGrantRevoked,
    findActiveFolderMemberships,
    revokeGrantRow
  };
};
