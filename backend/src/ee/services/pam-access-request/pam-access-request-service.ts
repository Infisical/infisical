import { Knex } from "knex";

import { TApprovalRequestGrants } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ResourcePermissionApprovalPolicyActions,
  ResourcePermissionPamResourceActions
} from "@app/ee/services/permission/resource-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import { ApprovalPolicyScope, ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalPolicyServiceFactory } from "@app/services/approval-policy/approval-policy-service";
import { TApprovalActor } from "@app/services/approval-policy/approval-policy-types";
import { TApprovalRequestDALFactory } from "@app/services/approval-policy/approval-request-dal";
import { TPamAccessPolicyInputs } from "@app/services/approval-policy/pam-access/pam-access-policy-types";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { TWorkflowIntegrationDALFactory } from "@app/services/workflow-integration/workflow-integration-dal";
import { WorkflowIntegration } from "@app/services/workflow-integration/workflow-integration-types";

import { PamAccessType } from "../pam/pam-enums";
import { resolveAccountByPath } from "../pam/pam-fns";
import { checkAccountAccess, TActorContext, verifyProductMembership } from "../pam/pam-permission";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import { TPamAccessApprovalResource } from "./pam-access-approval-resource";
import { parseNotificationChannels, parseNotificationEvents } from "./pam-access-request-fns";
import {
  TAccessRequestActor,
  TBreakGlassAccessRequestDTO,
  TCheckGrantDTO,
  TCreateAccessRequestDTO,
  TGetAccessRequestCountDTO,
  TGetAccountApproversDTO,
  TGetApprovalConfigurationDTO,
  TListAccessRequestsDTO,
  TListPendingMyApprovalDTO,
  TPamAccessRequestData,
  TSetApprovalConfigurationDTO
} from "./pam-access-request-types";
import { TPamFolderNotificationConfigDALFactory } from "./pam-folder-notification-config-dal";

type TPamAccessRequestServiceFactoryDep = {
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findById">;
  approvalRequestDAL: Pick<
    TApprovalRequestDALFactory,
    | "find"
    | "findOne"
    | "findById"
    | "findByIdForUpdate"
    | "create"
    | "update"
    | "updateById"
    | "transaction"
    | "findStepsByRequestId"
    | "findByProjectId"
  >;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findByIdWithDetails" | "find" | "findOne">;
  pamFolderDAL: Pick<TPamFolderDALFactory, "findById" | "find" | "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  userDAL: Pick<TUserDALFactory, "findById" | "find">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  pamFolderNotificationConfigDAL: Pick<
    TPamFolderNotificationConfigDALFactory,
    "findByFolderIdWithIntegration" | "delete" | "insertMany" | "transaction"
  >;
  workflowIntegrationDAL: Pick<TWorkflowIntegrationDALFactory, "find">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  approvalPolicyService: Pick<
    TApprovalPolicyServiceFactory,
    | "create"
    | "updateById"
    | "deleteById"
    | "list"
    | "createRequest"
    | "approveRequest"
    | "rejectRequest"
    | "revokeGrant"
    | "getActiveGrant"
    | "getAccessStatuses"
    | "getScopeIdsWithApprovers"
    | "getBypassableScopeIds"
    | "reapScope"
    | "reapSubject"
    | "listScopeRequests"
    | "listPendingForApprover"
    | "countPendingForApprover"
    | "getApproverRoster"
    | "getScopeConfiguration"
    | "setScopeConfiguration"
  >;
  pamAccessApprovalResource: TPamAccessApprovalResource;
};

export type TPamAccessRequestServiceFactory = ReturnType<typeof pamAccessRequestServiceFactory>;

export const pamAccessRequestServiceFactory = ({
  approvalPolicyDAL,
  approvalRequestDAL,
  pamAccountDAL,
  pamFolderDAL,
  permissionService,
  userDAL,
  identityDAL,
  pamFolderNotificationConfigDAL,
  workflowIntegrationDAL,
  licenseService,
  approvalPolicyService,
  pamAccessApprovalResource
}: TPamAccessRequestServiceFactoryDep) => {
  const toSubjectActor = ({ actorId, actor }: TAccessRequestActor) => ({ id: actorId, type: actor });

  const toApprovalActor = (ctx: TActorContext): TApprovalActor => ({
    id: ctx.actorId,
    type: ctx.actor,
    authMethod: ctx.actorAuthMethod,
    orgId: ctx.actorOrgId
  });

  // Requests and grants attribute their actor to exactly one column: a user or a machine identity.
  // These build the matching filter so every lookup stays scoped to the calling actor's own rows.
  // Machine identities have no email; their name is the only human-readable attribution available.
  const resolveRequesterDisplay = async ({ actorId, actor }: TAccessRequestActor) => {
    if (actor === ActorType.IDENTITY) {
      const identity = await identityDAL.findById(actorId);
      return { name: identity?.name || actorId, email: "" };
    }
    const user = await userDAL.findById(actorId);
    if (!user) return { name: actorId, email: "" };
    const fullName = [user.firstName, user.lastName].filter((part): part is string => Boolean(part?.trim())).join(" ");
    return { name: fullName || user.username || user.email || actorId, email: user.email ?? "" };
  };

  const getNotificationConfigs = async (folderId: string) => {
    const configs = await pamFolderNotificationConfigDAL.findByFolderIdWithIntegration(folderId);
    return configs.map((config) => ({
      id: config.id,
      workflowIntegrationId: config.workflowIntegrationId,
      integration: config.integration,
      integrationSlug: config.slug,
      channels: parseNotificationChannels(config.channels),
      events: parseNotificationEvents(config.events)
    }));
  };

  // Guards cross-project IDOR and checks the actor may manage the configuration
  const assertFolderPolicyManagement = async (folderId: string, projectId: string, ctx: TActorContext) => {
    await pamAccessApprovalResource.assertCanManagePolicy?.({
      projectId,
      scopeId: folderId,
      actor: toApprovalActor(ctx),
      action: ResourcePermissionApprovalPolicyActions.Edit
    });

    const folder = await pamFolderDAL.findById(folderId);
    if (!folder || folder.projectId !== projectId) {
      throw new NotFoundError({ message: "Folder not found" });
    }
    return folder;
  };

  // Attach the access grant's expiry and status to each request. Requests themselves carry no expiry
  // or revocation state; the meaningful "expires"/"revoked" lives on the grant created on approval.
  const getApprovalConfiguration = async ({ folderId, projectId, ...ctx }: TGetApprovalConfigurationDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    const folder = await pamFolderDAL.findById(folderId);
    if (!folder || folder.projectId !== projectId) {
      throw new NotFoundError({ message: "Folder not found" });
    }

    const { steps, bypassers } = await approvalPolicyService.getScopeConfiguration(
      ApprovalPolicyType.PamAccess,
      ApprovalPolicyScope.PamFolder,
      folderId,
      toApprovalActor(ctx)
    );

    return {
      steps: steps.map((step) => ({ approvers: step.approvers })),
      notificationConfigs: await getNotificationConfigs(folderId),
      breakGlassUsers: bypassers
    };
  };

  const setApprovalConfiguration = async ({
    folderId,
    projectId,
    steps,
    notificationConfigs,
    breakGlassUsers,
    ...ctx
  }: TSetApprovalConfigurationDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);
    const folder = await assertFolderPolicyManagement(folderId, projectId, ctx);

    if (steps.length > 1) {
      throw new BadRequestError({ message: "Phase 1 only supports a single approval step" });
    }

    const requestedApprovers = steps.flatMap((step) => step.approvers);
    const managesBreakGlass = breakGlassUsers !== undefined;
    const dedupedBreakGlassUsers = [
      ...new Map((breakGlassUsers ?? []).map((bypasser) => [`${bypasser.type}:${bypasser.id}`, bypasser])).values()
    ];

    if (dedupedBreakGlassUsers.length > 0 && requestedApprovers.length === 0) {
      throw new BadRequestError({
        message: "Break-glass users can only be configured on a folder that has approvers"
      });
    }

    await pamAccessApprovalResource.verifyPolicyActors?.({
      projectId,
      scopeId: folderId,
      approvers: requestedApprovers,
      bypassers: dedupedBreakGlassUsers
    });

    if (notificationConfigs !== undefined) {
      if (notificationConfigs.length > 0) {
        const plan = await licenseService.getPlan(ctx.actorOrgId);
        if (!plan.pamSlackNotifications) {
          throw new BadRequestError({
            message:
              "Failed to save notification configuration due to plan restriction. Upgrade plan to configure Slack notifications for PAM approvals."
          });
        }

        const integrationIds = [...new Set(notificationConfigs.map((c) => c.workflowIntegrationId))];
        const integrations = await workflowIntegrationDAL.find({ $in: { id: integrationIds } });
        const integrationById = new Map(integrations.map((i) => [i.id, i]));

        for (const config of notificationConfigs) {
          const integration = integrationById.get(config.workflowIntegrationId);
          if (!integration || integration.orgId !== ctx.actorOrgId) {
            throw new BadRequestError({ message: "Workflow integration not found in your organization" });
          }
          if (integration.integration !== WorkflowIntegration.SLACK) {
            throw new BadRequestError({
              message: "Only Slack workflow integrations are supported for PAM notifications"
            });
          }
        }
      }

      await pamFolderNotificationConfigDAL.transaction(async (tx) => {
        await pamFolderNotificationConfigDAL.delete({ folderId }, tx);
        if (notificationConfigs.length > 0) {
          await pamFolderNotificationConfigDAL.insertMany(
            notificationConfigs.map((config) => ({
              folderId,
              workflowIntegrationId: config.workflowIntegrationId,
              // arrays must be pre-serialized or knex binds them as PG arrays instead of jsonb
              channels: JSON.stringify(config.channels),
              events: JSON.stringify(config.events)
            })),
            tx
          );
        }
      });
    }

    const { policyId } = await approvalPolicyService.setScopeConfiguration(
      ApprovalPolicyType.PamAccess,
      ApprovalPolicyScope.PamFolder,
      folderId,
      {
        steps: steps.map((step) => ({ requiredApprovals: 1, approvers: step.approvers })),
        ...(managesBreakGlass ? { bypassers: dedupedBreakGlassUsers } : {}),
        name: `PAM Folder Approval - ${folder.name}`,
        conditions: [],
        constraints: { accessDuration: { min: "30s", max: "7d" } }
      },
      toApprovalActor(ctx)
    );

    return {
      policyId,
      folderId,
      stepCount: steps.length,
      notificationConfigCount: notificationConfigs?.length,
      breakGlassUserCount: managesBreakGlass ? dedupedBreakGlassUsers.length : undefined
    };
  };

  const breakGlassRequest = async ({ requestId, projectId, bypassReason, ...ctx }: TBreakGlassAccessRequestDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    const trimmedReason = bypassReason.trim();
    if (trimmedReason.length < 10) {
      throw new BadRequestError({
        message: "A break-glass reason of at least 10 characters is required. It is recorded in the audit log."
      });
    }

    if (ctx.actor !== ActorType.USER) {
      throw new ForbiddenRequestError({ message: "Only users can break glass on an access request" });
    }

    const request = await approvalRequestDAL.findById(requestId);
    if (!request || request.projectId !== projectId || request.type !== ApprovalPolicyType.PamAccess) {
      throw new NotFoundError({ message: "Request not found" });
    }

    if (request.requesterId !== ctx.actorId) {
      throw new ForbiddenRequestError({ message: "You can only break glass on your own access request" });
    }

    const requestData = request.requestData as { version: number; requestData: TPamAccessRequestData } | null;
    const folderId = requestData?.requestData?.folderId;
    const accountId = requestData?.requestData?.accountId;
    if (!folderId || !accountId) {
      throw new BadRequestError({ message: "This request is missing the account it was raised for" });
    }

    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.projectId !== projectId || account.folderId !== folderId) {
      throw new BadRequestError({
        message: "This request is no longer valid because the account has moved or been removed"
      });
    }

    // Break-glass skips the approver, not the permission the request itself needed.
    const accessType = requestData.requestData.accessType ?? PamAccessType.Session;
    await checkAccountAccess(
      permissionService,
      account.id,
      account.folderId,
      projectId,
      accessType === PamAccessType.Credential
        ? ResourcePermissionPamResourceActions.ViewCredentials
        : ResourcePermissionPamResourceActions.LaunchSessions,
      ctx
    );

    await pamAccessApprovalResource.assertBreakGlassEligible({
      projectId,
      accountId,
      folderId,
      actor: toApprovalActor(ctx)
    });

    const policy = request.policyId ? await approvalPolicyDAL.findById(request.policyId) : null;

    const { request: updatedRequest, bypassMetadata } = await approvalPolicyService.approveRequest(
      requestId,
      { bypassReason: trimmedReason },
      toApprovalActor(ctx),
      ApprovalPolicyType.PamAccess
    );

    if (!bypassMetadata) {
      throw new BadRequestError({
        message: "Break-glass could not be applied because this folder's approval configuration changed. Try again."
      });
    }

    return {
      request: updatedRequest,
      accountId,
      folderId,
      accountType: account.accountType,
      grantId: bypassMetadata.grantId,
      policyId: policy?.id ?? null,
      policyName: policy?.name,
      accountName: account.name,
      folderName: account.folderName,
      granteeName: request.requesterName,
      granteeEmail: request.requesterEmail,
      accessDuration: requestData.requestData.duration,
      approverCount: bypassMetadata.approverCount
    };
  };

  const createRequest = async ({
    accountId,
    path,
    projectId,
    reason,
    duration,
    accessType = PamAccessType.Session,
    breakGlass = false,
    ...ctx
  }: TCreateAccessRequestDTO) => {
    const trimmedReason = reason?.trim() || undefined;

    if (!accountId && !path) {
      throw new BadRequestError({ message: "Either 'accountId' or 'path' is required" });
    }

    if (breakGlass && (trimmedReason?.length ?? 0) < 10) {
      throw new BadRequestError({
        message: "A reason of at least 10 characters is required to break glass. It is recorded in the audit log."
      });
    }

    // The CLI supplies a 'folderName/accountName' path; the dashboard supplies an accountId.
    const account = path
      ? await resolveAccountByPath({ pamFolderDAL, pamAccountDAL }, projectId, path)
      : await pamAccountDAL.findByIdWithDetails(accountId as string);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: "Account not found" });
    }

    if (!account.folderId) {
      throw new BadRequestError({ message: "Account must be in a folder to require approval" });
    }

    if (breakGlass) {
      await pamAccessApprovalResource.assertBreakGlassEligible({
        projectId,
        accountId: account.id,
        folderId: account.folderId,
        actor: toApprovalActor(ctx)
      });
    }

    const requester = await resolveRequesterDisplay(ctx);

    const { request } = await approvalPolicyService.createRequest(
      ApprovalPolicyType.PamAccess,
      {
        scope: ApprovalPolicyScope.PamFolder,
        scopeId: account.folderId,
        requestData: {
          accountId: account.id,
          folderId: account.folderId,
          reason: trimmedReason,
          duration,
          accessType
        },
        justification: trimmedReason,
        skipApproverNotification: breakGlass,
        machineIdentityId: ctx.actor === ActorType.IDENTITY ? ctx.actorId : undefined,
        requesterName: requester.name,
        requesterEmail: requester.email
      },
      toApprovalActor(ctx)
    );

    if (breakGlass) {
      const result = await breakGlassRequest({
        requestId: request.id,
        projectId,
        bypassReason: trimmedReason as string,
        ...ctx
      });
      return {
        request: result.request,
        accountId: account.id,
        accountName: account.name,
        folderId: account.folderId,
        folderName: account.folderName,
        accountType: account.accountType,
        accessType,
        brokeGlass: true as const,
        breakGlassMetadata: result
      };
    }

    return {
      request,
      accountId: account.id,
      accountName: account.name,
      folderId: account.folderId,
      folderName: account.folderName,
      accountType: account.accountType,
      accessType,
      brokeGlass: false as const,
      breakGlassMetadata: undefined
    };
  };

  const listRequests = async ({ projectId, folderId, status, offset, limit, ...ctx }: TListAccessRequestsDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    if (!folderId) {
      throw new BadRequestError({ message: "folderId is required" });
    }

    const { requests, totalCount } = await approvalPolicyService.listScopeRequests(
      ApprovalPolicyType.PamAccess,
      ApprovalPolicyScope.PamFolder,
      folderId,
      { status, offset, limit },
      toApprovalActor(ctx)
    );

    return { requests: await pamAccessApprovalResource.decorateRequests(requests), totalCount };
  };

  const listPendingMyApproval = async ({ projectId, folderId, ...ctx }: TListPendingMyApprovalDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    const { requests } = await approvalPolicyService.listPendingForApprover(
      ApprovalPolicyType.PamAccess,
      ApprovalPolicyScope.PamFolder,
      { projectId, scopeId: folderId },
      toApprovalActor(ctx)
    );

    return { requests: await pamAccessApprovalResource.decorateRequests(requests) };
  };

  const getCount = async ({ projectId, ...ctx }: TGetAccessRequestCountDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    return approvalPolicyService.countPendingForApprover(
      ApprovalPolicyType.PamAccess,
      ApprovalPolicyScope.PamFolder,
      projectId,
      toApprovalActor(ctx)
    );
  };

  const cleanupFolderResources = (folderId: string, tx: Knex) =>
    approvalPolicyService.reapScope(ApprovalPolicyType.PamAccess, ApprovalPolicyScope.PamFolder, folderId, tx);

  const cleanupAccountResources = (
    {
      accountId,
      projectId,
      actorId
    }: { accountId: string; folderId?: string | null; projectId: string; actorId: string },
    tx: Knex
  ) =>
    approvalPolicyService.reapSubject(
      ApprovalPolicyType.PamAccess,
      { projectId, inputs: { accountId } as TPamAccessPolicyInputs, actorId, reason: "Account deleted" },
      tx
    );

  const checkGrant = async ({
    accountId,
    accountFolderId,
    projectId,
    accessType = PamAccessType.Session,
    ...actorCtx
  }: TCheckGrantDTO): Promise<TApprovalRequestGrants | null> =>
    approvalPolicyService.getActiveGrant(ApprovalPolicyType.PamAccess, projectId, toSubjectActor(actorCtx), {
      accountId,
      folderId: accountFolderId as string,
      accessType
    });

  const getAccessStatusBatch = async (
    actorCtx: TAccessRequestActor,
    accountIds: string[],
    projectId: string,
    accessType: PamAccessType = PamAccessType.Session
  ) => {
    const statuses = await approvalPolicyService.getAccessStatuses(
      ApprovalPolicyType.PamAccess,
      projectId,
      toSubjectActor(actorCtx),
      accountIds.map((accountId) => ({ accountId, accessType }))
    );

    return new Map(accountIds.map((accountId, i) => [accountId, statuses[i]]));
  };

  // A folder counts as "configured" only when its policy has at least one approver, so an empty policy
  // surfaces the unavailable flag.
  const getFolderPolicyConfigured = async (folderIds: string[]): Promise<Set<string>> =>
    new Set(
      await approvalPolicyService.getScopeIdsWithApprovers(
        ApprovalPolicyType.PamAccess,
        ApprovalPolicyScope.PamFolder,
        folderIds
      )
    );

  // Of the given folders, the ones where this actor is a named break-glass user. Drives whether the
  // account list offers the break-glass action at all.
  const getBreakGlassUserFolders = async (
    folderIds: string[],
    actorCtx: TAccessRequestActor,
    orgId: string
  ): Promise<Set<string>> =>
    new Set(
      await approvalPolicyService.getBypassableScopeIds(
        ApprovalPolicyType.PamAccess,
        ApprovalPolicyScope.PamFolder,
        folderIds,
        { id: actorCtx.actorId, type: actorCtx.actor, orgId, authMethod: null }
      )
    );

  const getAccountApprovers = async ({
    accountId,
    projectId,
    accessType = PamAccessType.Session,
    ...ctx
  }: TGetAccountApproversDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    const account = await pamAccountDAL.findByIdWithDetails(accountId);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: "Account not found" });
    }

    await checkAccountAccess(
      permissionService,
      account.id,
      account.folderId,
      projectId,
      accessType === PamAccessType.Credential
        ? ResourcePermissionPamResourceActions.ViewCredentials
        : ResourcePermissionPamResourceActions.LaunchSessions,
      ctx
    );

    if (!account.folderId) return { steps: [] };

    return approvalPolicyService.getApproverRoster(
      ApprovalPolicyType.PamAccess,
      ApprovalPolicyScope.PamFolder,
      {
        projectId,
        scopeId: account.folderId,
        inputs: { accountId: account.id, accessType } as TPamAccessPolicyInputs
      },
      toSubjectActor(ctx)
    );
  };

  return {
    getApprovalConfiguration,
    getAccountApprovers,
    setApprovalConfiguration,
    createRequest,
    breakGlassRequest,
    listRequests,
    listPendingMyApproval,
    getCount,
    checkGrant,
    getAccessStatusBatch,
    getFolderPolicyConfigured,
    getBreakGlassUserFolders,
    cleanupFolderResources,
    cleanupAccountResources
  };
};
