import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { RESOURCE_SCOPE, ResourceType, TApprovalRequestGrants } from "@app/db/schemas";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ResourcePermissionPamResourceActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { formatDuration, ms } from "@app/lib/ms";
import { TNotification, TriggerFeature } from "@app/lib/workflow-integrations/types";
import {
  TApprovalPolicyBypassersDALFactory,
  TApprovalPolicyDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "@app/services/approval-policy/approval-policy-dal";
import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApprovalRequestApprovalDecision,
  ApprovalRequestGrantStatus,
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  ApproverType,
  EnforcementLevel
} from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalRequestData } from "@app/services/approval-policy/approval-policy-types";
import {
  TApprovalRequestApprovalsDALFactory,
  TApprovalRequestDALFactory,
  TApprovalRequestGrantsDALFactory,
  TApprovalRequestStepEligibleApproversDALFactory,
  TApprovalRequestStepsDALFactory
} from "@app/services/approval-policy/approval-request-dal";
import {
  createApprovalRequestWithSteps,
  notifyApproversForStep
} from "@app/services/approval-policy/approval-request-fns";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { sendSlackNotification } from "@app/services/slack/slack-fns";
import { TSlackIntegrationDALFactory } from "@app/services/slack/slack-integration-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { TWorkflowIntegrationDALFactory } from "@app/services/workflow-integration/workflow-integration-dal";
import { WorkflowIntegration } from "@app/services/workflow-integration/workflow-integration-types";

import { PamAccessStatus, PamNotificationEvent, PamProductRole, PamSessionStatus } from "../pam/pam-enums";
import { resolveAccountByPath } from "../pam/pam-fns";
import {
  checkAccountAccess,
  checkFolderPermission,
  TActorContext,
  verifyProductMembership
} from "../pam/pam-permission";
import { resolveAccessControls } from "../pam/pam-policies";
import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { TPamAccountTemplateDALFactory } from "../pam-account-template/pam-account-template-dal";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { terminatePamSessions } from "../pam-session/pam-session-fns";
import { getSlackSendTargets, parseNotificationChannels, parseNotificationEvents } from "./pam-access-request-fns";
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
  TReviewAccessRequestDTO,
  TRevokeAccessRequestDTO,
  TSetApprovalConfigurationDTO
} from "./pam-access-request-types";
import { TPamFolderNotificationConfigDALFactory } from "./pam-folder-notification-config-dal";

type TPamAccessRequestServiceFactoryDep = {
  approvalPolicyDAL: Pick<
    TApprovalPolicyDALFactory,
    | "find"
    | "findOne"
    | "create"
    | "deleteById"
    | "transaction"
    | "findStepsByPolicyId"
    | "isProjectApprover"
    | "findScopeIdsWithApprovers"
    | "findBypassersByPolicyId"
    | "findBypassersByPolicyIds"
  >;
  approvalPolicyStepsDAL: Pick<TApprovalPolicyStepsDALFactory, "create" | "delete">;
  approvalPolicyStepApproversDAL: Pick<TApprovalPolicyStepApproversDALFactory, "create" | "delete">;
  approvalPolicyBypassersDAL: Pick<TApprovalPolicyBypassersDALFactory, "create" | "delete">;
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
  approvalRequestStepsDAL: Pick<TApprovalRequestStepsDALFactory, "create" | "updateById">;
  approvalRequestStepEligibleApproversDAL: Pick<TApprovalRequestStepEligibleApproversDALFactory, "create">;
  approvalRequestApprovalsDAL: Pick<TApprovalRequestApprovalsDALFactory, "create" | "find">;
  approvalRequestGrantsDAL: Pick<TApprovalRequestGrantsDALFactory, "find" | "findOne" | "create" | "updateById">;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findByIdWithDetails" | "find" | "findOne">;
  pamAccountTemplateDAL: Pick<TPamAccountTemplateDALFactory, "find">;
  pamFolderDAL: Pick<TPamFolderDALFactory, "findById" | "find" | "findOne">;
  pamSessionDAL: Pick<TPamSessionDALFactory, "find" | "update">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
  membershipDAL: Pick<TMembershipDALFactory, "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  smtpService: Pick<TSmtpService, "sendMail">;
  groupDAL: Pick<TGroupDALFactory, "find">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find" | "findGroupMembershipsByUserIdInOrg">;
  userDAL: Pick<TUserDALFactory, "findById" | "find">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  pamFolderNotificationConfigDAL: Pick<
    TPamFolderNotificationConfigDALFactory,
    "findByFolderIdWithIntegration" | "delete" | "insertMany" | "transaction"
  >;
  workflowIntegrationDAL: Pick<TWorkflowIntegrationDALFactory, "find">;
  slackIntegrationDAL: Pick<TSlackIntegrationDALFactory, "findByIdWithWorkflowIntegrationDetails">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TPamAccessRequestServiceFactory = ReturnType<typeof pamAccessRequestServiceFactory>;

export const pamAccessRequestServiceFactory = ({
  approvalPolicyDAL,
  approvalPolicyStepsDAL,
  approvalPolicyStepApproversDAL,
  approvalPolicyBypassersDAL,
  approvalRequestDAL,
  approvalRequestStepsDAL,
  approvalRequestStepEligibleApproversDAL,
  approvalRequestApprovalsDAL,
  approvalRequestGrantsDAL,
  pamAccountDAL,
  pamAccountTemplateDAL,
  pamFolderDAL,
  pamSessionDAL,
  gatewayV2Service,
  membershipDAL,
  membershipRoleDAL,
  permissionService,
  notificationService,
  smtpService,
  groupDAL,
  userGroupMembershipDAL,
  userDAL,
  identityDAL,
  pamFolderNotificationConfigDAL,
  workflowIntegrationDAL,
  slackIntegrationDAL,
  kmsService,
  licenseService
}: TPamAccessRequestServiceFactoryDep) => {
  const findFolderPolicy = async (folderId: string) => {
    const policy = await approvalPolicyDAL.findOne({
      type: ApprovalPolicyType.PamAccess,
      scopeType: ApprovalPolicyScope.PamFolder,
      scopeId: folderId
    });
    return policy ?? null;
  };

  const isFolderBreakGlassApprover = async (
    policyId: string,
    userId: string,
    userGroupIds: Set<string>
  ): Promise<boolean> => {
    const bypassers = await approvalPolicyDAL.findBypassersByPolicyId(policyId);
    return bypassers.some(
      (b) =>
        (b.type === ApproverType.User && b.id === userId) || (b.type === ApproverType.Group && userGroupIds.has(b.id))
    );
  };

  // Requests and grants attribute their actor to exactly one column: a user or a machine identity.
  // These build the matching filter so every lookup stays scoped to the calling actor's own rows.
  const actorRequestFilter = ({ actorId, actor }: TAccessRequestActor) =>
    actor === ActorType.IDENTITY ? { machineIdentityId: actorId } : { requesterId: actorId };

  const actorGrantFilter = ({ actorId, actor }: TAccessRequestActor) =>
    actor === ActorType.IDENTITY ? { granteeMachineIdentityId: actorId } : { granteeUserId: actorId };

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

  // Chat notifications are best-effort: they must never fail or delay the request flow itself.
  const triggerFolderSlackNotifications = async ({
    folderId,
    event,
    orgId,
    notification
  }: {
    folderId: string;
    event: PamNotificationEvent;
    orgId: string;
    notification: TNotification;
  }) => {
    try {
      const plan = await licenseService.getPlan(orgId);
      if (!plan.pamSlackNotifications) return;

      const configs = await pamFolderNotificationConfigDAL.findByFolderIdWithIntegration(folderId);
      const targets = getSlackSendTargets(configs, event);

      for (const target of targets) {
        // eslint-disable-next-line no-await-in-loop
        const slackIntegration = await slackIntegrationDAL.findByIdWithWorkflowIntegrationDetails(
          target.workflowIntegrationId
        );
        if (slackIntegration) {
          // eslint-disable-next-line no-await-in-loop
          await sendSlackNotification({
            orgId,
            notification,
            kmsService,
            targetChannelIds: target.channelIds,
            slackIntegration
          });
        }
      }
    } catch (err) {
      logger.error(err, `Failed to send PAM Slack notifications [folderId=${folderId}] [event=${event}]`);
    }
  };

  const notifyFolderChannelsOfDecision = async (params: {
    folderId: string;
    decision: ApprovalRequestApprovalDecision;
    requesterName?: string | null;
    requesterEmail?: string | null;
    accountName?: string;
    comment?: string;
    orgId: string;
    requestId: string;
  }) => {
    const approved = params.decision === ApprovalRequestApprovalDecision.Approved;
    try {
      const folder = await pamFolderDAL.findById(params.folderId);
      const cfg = getConfig();
      await triggerFolderSlackNotifications({
        folderId: params.folderId,
        event: approved ? PamNotificationEvent.AccessRequestApproved : PamNotificationEvent.AccessRequestDenied,
        orgId: params.orgId,
        notification: {
          type: approved ? TriggerFeature.PAM_ACCESS_REQUEST_APPROVED : TriggerFeature.PAM_ACCESS_REQUEST_DENIED,
          payload: {
            requesterFullName: params.requesterName || "Unknown",
            requesterEmail: params.requesterEmail || "Machine Identity",
            accountName: params.accountName ?? "a PAM account",
            folderName: folder?.name ?? "",
            comment: params.comment,
            // Decided requests leave the approver inbox, so decision messages link to the
            // unified PAM Accounts page (same destination as the in-app notification)
            approvalUrl: `${cfg.SITE_URL}/organizations/${params.orgId}/pam/accounts`
          }
        }
      });
    } catch (err) {
      logger.error(err, `Failed to send PAM review Slack notifications [requestId=${params.requestId}]`);
    }
  };

  // npm ms returns undefined (not an error) for strings it can't parse, e.g. Go-style "2h30m"
  const parseDurationMs = (duration: string): number => {
    const durationMs: number | undefined = ms(duration);
    if (!durationMs || durationMs <= 0) {
      throw new BadRequestError({
        message: `Invalid access duration '${duration}'. Use a single unit like '30m', '2h', or '1d'`
      });
    }
    return durationMs;
  };

  // Confirms the folder belongs to the project (guards cross-project IDOR) and that the actor may
  // manage its approval configuration. Used by every folder-scoped approval admin surface.
  const assertFolderPolicyManagement = async (folderId: string, projectId: string, ctx: TActorContext) => {
    const folder = await pamFolderDAL.findById(folderId);
    if (!folder || folder.projectId !== projectId) {
      throw new NotFoundError({ message: "Folder not found" });
    }
    const { permission } = await checkFolderPermission(permissionService, folderId, projectId, ctx);
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionPamResourceActions.ManagePolicies,
      ResourcePermissionSub.PamResource
    );
    return folder;
  };

  const getUserGroupIds = async (userId: string, orgId: string): Promise<Set<string>> => {
    const memberships = await userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg(userId, orgId);
    return new Set(memberships.map((m) => m.groupId));
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

  const enrichRequestsWithNames = async <T extends { requestData?: unknown }>(requests: T[]) => {
    const accountIds = new Set<string>();
    const folderIds = new Set<string>();
    for (const r of requests) {
      const data = r.requestData as { version: number; requestData: TPamAccessRequestData } | null;
      if (data?.requestData?.accountId) accountIds.add(data.requestData.accountId);
      if (data?.requestData?.folderId) folderIds.add(data.requestData.folderId);
    }

    const [accounts, folders] = await Promise.all([
      accountIds.size > 0 ? pamAccountDAL.find({ $in: { id: [...accountIds] } }) : [],
      folderIds.size > 0 ? pamFolderDAL.find({ $in: { id: [...folderIds] } }) : []
    ]);
    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const folderMap = new Map(folders.map((f) => [f.id, f]));

    const templateIds = [...new Set(accounts.map((a) => a.templateId).filter(Boolean))];
    const templates = templateIds.length > 0 ? await pamAccountTemplateDAL.find({ $in: { id: templateIds } }) : [];
    const templateTypeMap = new Map(templates.map((t) => [t.id, t.type]));

    return requests.map((r) => {
      const data = r.requestData as { version: number; requestData: TPamAccessRequestData } | null;
      const account = data?.requestData?.accountId ? accountMap.get(data.requestData.accountId) : null;
      const folder = data?.requestData?.folderId ? folderMap.get(data.requestData.folderId) : null;
      return {
        ...r,
        accountName: account?.name ?? null,
        accountType: account?.templateId ? (templateTypeMap.get(account.templateId) ?? null) : null,
        folderName: folder?.name ?? null
      };
    });
  };

  // Attach the access grant's expiry and status to each request. Requests themselves carry no expiry
  // or revocation state; the meaningful "expires"/"revoked" lives on the grant created on approval.
  const attachGrantExpiry = async <T extends { id: string }>(requests: T[]) => {
    if (requests.length === 0)
      return requests.map((r) => ({
        ...r,
        grantExpiresAt: null as Date | null,
        grantStatus: null as string | null,
        isBreakGlass: false,
        bypassReason: null as string | null
      }));

    const grants = await approvalRequestGrantsDAL.find({ $in: { requestId: requests.map((r) => r.id) } });
    const grantByRequestId = new Map<
      string,
      { expiresAt: Date | null; status: string; isBreakGlass: boolean; bypassReason: string | null }
    >();
    grants
      .filter((g) => g.requestId)
      .forEach((g) =>
        grantByRequestId.set(g.requestId as string, {
          expiresAt: g.expiresAt ?? null,
          status: g.status,
          isBreakGlass: Boolean(g.isBreakGlass),
          bypassReason: g.bypassReason ?? null
        })
      );

    return requests.map((r) => {
      const grant = grantByRequestId.get(r.id);
      return {
        ...r,
        grantExpiresAt: grant?.expiresAt ?? null,
        grantStatus: grant?.status ?? null,
        isBreakGlass: grant?.isBreakGlass ?? false,
        bypassReason: grant?.bypassReason ?? null
      };
    });
  };

  const isUserEligibleApprover = (
    approvers: { type: string; id: string }[],
    userId: string,
    userGroupIds: Set<string>
  ): boolean => {
    return approvers.some(
      (a) =>
        (a.type === ApproverType.User && a.id === userId) || (a.type === ApproverType.Group && userGroupIds.has(a.id))
    );
  };

  const getApprovalConfiguration = async ({ folderId, projectId, ...ctx }: TGetApprovalConfigurationDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    const folder = await pamFolderDAL.findById(folderId);
    if (!folder || folder.projectId !== projectId) {
      throw new NotFoundError({ message: "Folder not found" });
    }

    // Viewing the configuration is read-only, so auditors (ViewAuditLogs) may see it alongside
    // policy managers; editing still requires ManagePolicies via assertFolderPolicyManagement.
    const { permission } = await checkFolderPermission(permissionService, folderId, projectId, ctx);
    const canView =
      permission.can(ResourcePermissionPamResourceActions.ManagePolicies, ResourcePermissionSub.PamResource) ||
      permission.can(ResourcePermissionPamResourceActions.ViewAuditLogs, ResourcePermissionSub.PamResource);
    if (!canView) {
      throw new ForbiddenRequestError({
        message: "You are not authorized to view this folder's approval configuration"
      });
    }

    const notificationConfigs = await getNotificationConfigs(folderId);

    const policy = await findFolderPolicy(folderId);
    if (!policy) {
      return { steps: [], notificationConfigs, breakGlassApprovers: [] };
    }

    // The policy row and step tuning fields are internal; the UI only needs the approver lists.
    const [steps, breakGlassApprovers] = await Promise.all([
      approvalPolicyDAL.findStepsByPolicyId(policy.id),
      approvalPolicyDAL.findBypassersByPolicyId(policy.id)
    ]);
    return {
      steps: steps.map((s) => ({ approvers: s.approvers })),
      notificationConfigs,
      breakGlassApprovers: breakGlassApprovers.map((b) => ({ type: b.type, id: b.id }))
    };
  };

  const setApprovalConfiguration = async ({
    folderId,
    projectId,
    steps,
    notificationConfigs,
    breakGlassApprovers,
    ...ctx
  }: TSetApprovalConfigurationDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);
    const folder = await assertFolderPolicyManagement(folderId, projectId, ctx);

    if (steps.length > 1) {
      throw new BadRequestError({ message: "Phase 1 only supports a single approval step" });
    }

    // Approvers and break-glass approvers must be active members of the folder. This keeps both lists in
    // sync with membership so that removing someone from the folder (which strips their approver rows)
    // can't be circumvented by designating a non-member or expired member.
    const requestedApprovers = steps.flatMap((s) => s.approvers);
    const managesBreakGlass = breakGlassApprovers !== undefined;
    const requestedBreakGlassApprovers = breakGlassApprovers ?? [];
    if (requestedApprovers.length > 0 || requestedBreakGlassApprovers.length > 0) {
      const memberships = await findActiveFolderMemberships(projectId, folderId);
      const memberUserIds = new Set(memberships.map((m) => m.actorUserId).filter(Boolean));
      const memberGroupIds = new Set(memberships.map((m) => m.actorGroupId).filter(Boolean));
      const isFolderMember = (entry: { type: ApproverType; id: string }) =>
        entry.type === ApproverType.User ? memberUserIds.has(entry.id) : memberGroupIds.has(entry.id);

      for (const approver of requestedApprovers) {
        if (!isFolderMember(approver)) {
          throw new BadRequestError({ message: "Approvers must be members of the folder" });
        }
      }

      for (const bypasser of requestedBreakGlassApprovers) {
        if (!isFolderMember(bypasser)) {
          throw new BadRequestError({ message: "Break-glass approvers must be members of the folder" });
        }
      }
    }

    const dedupedBreakGlassApprovers = [
      ...new Map(requestedBreakGlassApprovers.map((b) => [`${b.type}:${b.id}`, b])).values()
    ];

    if (dedupedBreakGlassApprovers.length > 0 && requestedApprovers.length === 0) {
      throw new BadRequestError({
        message: "Break-glass approvers can only be configured on a folder that has approvers"
      });
    }

    const replaceBreakGlassApprovers = async (policyId: string, tx: Knex) => {
      if (!managesBreakGlass) return;
      await approvalPolicyBypassersDAL.delete({ policyId }, tx);
      for (const bypasser of dedupedBreakGlassApprovers) {
        // eslint-disable-next-line no-await-in-loop
        await approvalPolicyBypassersDAL.create(
          {
            policyId,
            userId: bypasser.type === ApproverType.User ? bypasser.id : null,
            groupId: bypasser.type === ApproverType.Group ? bypasser.id : null
          },
          tx
        );
      }
    };

    // Notification configs live independent of the policy row, so they are persisted before the
    // policy branches below; several of those branches return early.
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
    const notificationConfigCount = notificationConfigs?.length;

    const existingPolicy = await findFolderPolicy(folderId);

    const hasApprovers = steps.length === 1 && steps[0].approvers.length > 0;
    if (!hasApprovers && existingPolicy) {
      await approvalPolicyDAL.transaction(async (tx) => {
        await approvalPolicyStepsDAL.delete({ policyId: existingPolicy.id }, tx);
        await approvalPolicyDAL.deleteById(existingPolicy.id, tx);
      });
      return {
        policyId: existingPolicy.id,
        folderId,
        stepCount: steps.length,
        notificationConfigCount,
        breakGlassApproverCount: 0
      };
    }

    if (!hasApprovers) {
      return { policyId: null, folderId, stepCount: 0, notificationConfigCount, breakGlassApproverCount: 0 };
    }

    if (existingPolicy) {
      await approvalPolicyDAL.transaction(async (tx) => {
        await approvalPolicyStepsDAL.delete({ policyId: existingPolicy.id }, tx);

        for (let i = 0; i < steps.length; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          const newStep = await approvalPolicyStepsDAL.create(
            {
              policyId: existingPolicy.id,
              stepNumber: i + 1,
              requiredApprovals: 1,
              notifyApprovers: true
            },
            tx
          );

          for (const approver of steps[i].approvers) {
            // eslint-disable-next-line no-await-in-loop
            await approvalPolicyStepApproversDAL.create(
              {
                policyStepId: newStep.id,
                userId: approver.type === ApproverType.User ? approver.id : null,
                groupId: approver.type === ApproverType.Group ? approver.id : null
              },
              tx
            );
          }
        }

        await replaceBreakGlassApprovers(existingPolicy.id, tx);
      });

      return {
        policyId: existingPolicy.id,
        folderId,
        stepCount: steps.length,
        notificationConfigCount,
        breakGlassApproverCount: managesBreakGlass ? dedupedBreakGlassApprovers.length : undefined
      };
    }

    const newPolicy = await approvalPolicyDAL.transaction(async (tx) => {
      const policy = await approvalPolicyDAL.create(
        {
          projectId,
          organizationId: ctx.actorOrgId,
          type: ApprovalPolicyType.PamAccess,
          name: `PAM Folder Approval - ${folder.name}`,
          scopeType: ApprovalPolicyScope.PamFolder,
          scopeId: folderId,
          enforcementLevel: EnforcementLevel.Hard,
          conditions: { version: 1, conditions: [] },
          constraints: { version: 1, constraints: { accessDuration: { min: "30s", max: "7d" } } }
        },
        tx
      );

      for (let i = 0; i < steps.length; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const step = await approvalPolicyStepsDAL.create(
          {
            policyId: policy.id,
            stepNumber: i + 1,
            requiredApprovals: 1,
            notifyApprovers: true
          },
          tx
        );

        for (const approver of steps[i].approvers) {
          // eslint-disable-next-line no-await-in-loop
          await approvalPolicyStepApproversDAL.create(
            {
              policyStepId: step.id,
              userId: approver.type === ApproverType.User ? approver.id : null,
              groupId: approver.type === ApproverType.Group ? approver.id : null
            },
            tx
          );
        }
      }

      await replaceBreakGlassApprovers(policy.id, tx);

      return policy;
    });

    return {
      policyId: newPolicy.id,
      folderId,
      stepCount: steps.length,
      notificationConfigCount,
      breakGlassApproverCount: managesBreakGlass ? dedupedBreakGlassApprovers.length : undefined
    };
  };

  const createRequest = async ({ accountId, path, projectId, reason, duration, ...ctx }: TCreateAccessRequestDTO) => {
    const trimmedReason = reason?.trim() || undefined;
    await verifyProductMembership(permissionService, projectId, ctx);

    if (!accountId && !path) {
      throw new BadRequestError({ message: "Either 'accountId' or 'path' is required" });
    }

    // The CLI supplies a 'folderName/accountName' path; the dashboard supplies an accountId.
    const account = path
      ? await resolveAccountByPath({ pamFolderDAL, pamAccountDAL }, projectId, path)
      : await pamAccountDAL.findByIdWithDetails(accountId as string);
    if (!account || account.projectId !== projectId) {
      throw new NotFoundError({ message: "Account not found" });
    }

    // Approval is a layer on top of standing access: only users who could launch sessions on this
    // account may request the temporary grant that unlocks the gated launch.
    await checkAccountAccess(
      permissionService,
      account.id,
      account.folderId,
      projectId,
      ResourcePermissionPamResourceActions.LaunchSessions,
      ctx
    );

    const accessControls = resolveAccessControls(account.templatePolicies);
    if (!accessControls.requiresApproval) {
      throw new BadRequestError({ message: "This account does not require approval" });
    }

    if (accessControls.requireReason && !trimmedReason) {
      throw new BadRequestError({
        name: "PAM_REASON_REQUIRED",
        message: "A reason is required to request access to this account"
      });
    }

    if (!account.folderId) {
      throw new BadRequestError({ message: "Account must be in a folder to require approval" });
    }

    const policy = await findFolderPolicy(account.folderId);
    if (!policy) {
      throw new BadRequestError({ message: "No approval configuration found for this folder" });
    }

    const durationMs = parseDurationMs(duration);
    const accessDuration = (
      policy.constraints as { constraints?: { accessDuration?: { min?: string; max?: string } } } | null
    )?.constraints?.accessDuration;
    const minMs = accessDuration?.min ? ms(accessDuration.min) : undefined;
    const maxMs = accessDuration?.max ? ms(accessDuration.max) : undefined;
    if (minMs && durationMs < minMs) {
      throw new BadRequestError({ message: `Access duration must be at least ${accessDuration?.min}` });
    }
    if (maxMs && durationMs > maxMs) {
      throw new BadRequestError({ message: `Access duration must be at most ${accessDuration?.max}` });
    }

    const existingPending = await approvalRequestDAL.find({
      ...actorRequestFilter(ctx),
      type: ApprovalPolicyType.PamAccess,
      status: ApprovalRequestStatus.Pending,
      projectId
    });

    const hasPendingForAccount = existingPending.some((r) => {
      const data = r.requestData as { version: number; requestData: TPamAccessRequestData } | null;
      return data?.requestData?.accountId === account.id;
    });

    if (hasPendingForAccount) {
      throw new BadRequestError({ message: "You already have a pending request for this account" });
    }

    const policySteps = await approvalPolicyDAL.findStepsByPolicyId(policy.id);

    // A step with no approvers can never be reviewed, wedging the request forever. The dashboard hides
    // the request action in this case, but that guard must also hold for the CLI and direct API callers.
    if (policySteps.length === 0 || policySteps.some((s) => s.approvers.length === 0)) {
      throw new BadRequestError({
        message:
          "This folder's approval policy has no approvers configured. Ask a folder admin to add approvers under the folder's Approvals tab, then submit your request again."
      });
    }

    const stepsForRequest = policySteps.map((s) => ({
      name: s.name ?? null,
      requiredApprovals: s.requiredApprovals,
      notifyApprovers: s.notifyApprovers ?? true,
      approvers: s.approvers
    }));

    const isIdentityActor = ctx.actor === ActorType.IDENTITY;
    const { name: requesterName, email: requesterEmail } = await resolveRequesterDisplay(ctx);

    const requestData = {
      accountId: account.id,
      folderId: account.folderId,
      reason: trimmedReason,
      duration
    } as unknown as TApprovalRequestData;

    const request = await createApprovalRequestWithSteps(
      {
        projectId,
        organizationId: ctx.actorOrgId,
        policyId: policy.id,
        policyType: ApprovalPolicyType.PamAccess,
        policySteps: stepsForRequest,
        requestData,
        justification: trimmedReason,
        requesterUserId: ctx.actor === ActorType.USER ? ctx.actorId : null,
        machineIdentityId: ctx.actor === ActorType.IDENTITY ? ctx.actorId : null,
        requesterName,
        requesterEmail,
        scopeType: ApprovalPolicyScope.PamFolder,
        scopeId: account.folderId
      },
      {
        approvalRequestDAL,
        approvalRequestStepsDAL,
        approvalRequestStepEligibleApproversDAL
      }
    );

    const approvalUrl = `${getConfig().SITE_URL}/organizations/${ctx.actorOrgId}/pam/approval-requests?requestId=${request.id}`;

    const firstStep = stepsForRequest[0];
    if (firstStep) {
      try {
        await notifyApproversForStep({ ...firstStep, notifyApprovers: true }, request, {
          userGroupMembershipDAL,
          notificationService
        });
      } catch (err) {
        logger.error(err, `Failed to send in-app notifications for PAM access request [requestId=${request.id}]`);
      }

      try {
        const approverUserIds = new Set<string>();
        firstStep.approvers.filter((a) => a.type === ApproverType.User).forEach((a) => approverUserIds.add(a.id));

        const groupMemberLists = await Promise.all(
          firstStep.approvers
            .filter((a) => a.type === ApproverType.Group)
            .map((a) => userGroupMembershipDAL.find({ groupId: a.id }))
        );
        groupMemberLists.forEach((members) => members.forEach((m) => approverUserIds.add(m.userId)));

        const approverUsers = approverUserIds.size > 0 ? await userDAL.find({ $in: { id: [...approverUserIds] } }) : [];
        const recipients = approverUsers.filter((u) => u.email).map((u) => u.email as string);

        if (recipients.length > 0) {
          await smtpService.sendMail({
            recipients,
            subjectLine: "PAM Access Request",
            template: SmtpTemplates.AccessPamRequest,
            substitutions: {
              requesterFullName: requesterName,
              // Machine identities have no email; the template renders the label alone
              requesterEmail: isIdentityActor ? "Machine Identity" : requesterEmail,
              accountName: account.name,
              folderName: account.folderName ?? undefined,
              accessDuration: formatDuration(duration),
              reason: trimmedReason,
              approvalUrl
            }
          });
        }
      } catch (err) {
        logger.error(err, `Failed to send approval emails for PAM access request [requestId=${request.id}]`);
      }
    }

    void triggerFolderSlackNotifications({
      folderId: account.folderId,
      event: PamNotificationEvent.AccessRequested,
      orgId: ctx.actorOrgId,
      notification: {
        type: TriggerFeature.PAM_ACCESS_REQUESTED,
        payload: {
          requesterFullName: requesterName,
          requesterEmail: isIdentityActor ? "Machine Identity" : requesterEmail,
          accountName: account.name,
          folderName: account.folderName ?? "",
          accessDuration: formatDuration(duration),
          reason: trimmedReason,
          approvalUrl
        }
      }
    });

    return { request, accountId: account.id, folderId: account.folderId, accountType: account.accountType };
  };

  const listRequests = async ({ projectId, folderId, status, offset, limit, ...ctx }: TListAccessRequestsDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    // This is the folder admin audit view (all requesters' requests), so it requires folder-level
    // approval management. An approver's own queue is served by listPendingMyApproval instead.
    if (!folderId) {
      throw new BadRequestError({ message: "folderId is required" });
    }
    await assertFolderPolicyManagement(folderId, projectId, ctx);

    const filter: Record<string, unknown> = {
      type: ApprovalPolicyType.PamAccess,
      projectId
    };

    if (status) filter.status = status;
    // PAM requests store their folder as scopeId, so pagination/filtering happens at the DB level.
    filter.scopeType = ApprovalPolicyScope.PamFolder;
    filter.scopeId = folderId;

    const requests = await approvalRequestDAL.find(filter, {
      sort: [["createdAt", "desc"]],
      offset,
      limit,
      count: true
    });
    const totalCount = Number(requests[0]?.count ?? 0);

    return {
      requests: await attachGrantExpiry(await enrichRequestsWithNames(requests)),
      totalCount
    };
  };

  // Whether the actor is currently an approver on the folder's live policy AND still holds an active
  // folder membership. This is the same authority reviewRequest enforces, so the approver queue and
  // the review action agree; the creation-time snapshot alone would leak requests (and requester PII)
  // to users removed as approvers after the request was created.
  const isLiveFolderApprover = async (
    projectId: string,
    folderId: string,
    actorId: string,
    userGroupIds: Set<string>
  ): Promise<boolean> => {
    const policy = await findFolderPolicy(folderId);
    if (!policy) return false;
    const steps = await approvalPolicyDAL.findStepsByPolicyId(policy.id);
    const onLivePolicy = steps.some((step) => isUserEligibleApprover(step.approvers, actorId, userGroupIds));
    if (!onLivePolicy) return false;
    const activeMemberships = await findActiveFolderMemberships(projectId, folderId);
    return activeMemberships.some(
      (m) => m.actorUserId === actorId || (m.actorGroupId && userGroupIds.has(m.actorGroupId))
    );
  };

  const listPendingMyApproval = async ({ projectId, folderId, ...ctx }: TListPendingMyApprovalDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    const userGroupIds = await getUserGroupIds(ctx.actorId, ctx.actorOrgId);

    // Fast reject for users who are not a live approver on any PAM policy in the project.
    const isApprover = await approvalPolicyDAL.isProjectApprover({
      projectId,
      userId: ctx.actorId,
      groupIds: [...userGroupIds],
      type: ApprovalPolicyType.PamAccess,
      scopeType: ApprovalPolicyScope.PamFolder
    });
    if (!isApprover) return { requests: [] };

    const requests = await approvalRequestDAL.findByProjectId(ApprovalPolicyType.PamAccess, projectId);

    // Only pending requests whose creation-time snapshot lists the actor belong in the queue...
    const candidates = requests.filter((request) => {
      if (request.status !== ApprovalRequestStatus.Pending) return false;

      if (folderId) {
        const data = request.requestData as { version: number; requestData: TPamAccessRequestData } | null;
        if (data?.requestData?.folderId !== folderId) return false;
      }

      const currentStep = request.steps.find((s) => s.stepNumber === request.currentStep);
      if (!currentStep) return false;

      return isUserEligibleApprover(currentStep.approvers, ctx.actorId, userGroupIds);
    });

    // ...but the snapshot is re-validated against each folder's live policy so requests whose approver
    // set changed after creation (e.g. the actor was removed) drop out rather than leaking.
    const involvedFolderIds = [
      ...new Set(
        candidates
          .map((r) => (r.requestData as { requestData?: TPamAccessRequestData } | null)?.requestData?.folderId)
          .filter((id): id is string => Boolean(id))
      )
    ];
    const liveApproverFolders = new Set<string>();
    for (const fId of involvedFolderIds) {
      // eslint-disable-next-line no-await-in-loop
      if (await isLiveFolderApprover(projectId, fId, ctx.actorId, userGroupIds)) {
        liveApproverFolders.add(fId);
      }
    }

    const result = candidates.filter((r) => {
      const fId = (r.requestData as { requestData?: TPamAccessRequestData } | null)?.requestData?.folderId;
      return Boolean(fId && liveApproverFolders.has(fId));
    });

    return { requests: await attachGrantExpiry(await enrichRequestsWithNames(result)) };
  };

  const getCount = async ({ projectId, ...ctx }: TGetAccessRequestCountDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    const userGroupIds = await getUserGroupIds(ctx.actorId, ctx.actorOrgId);

    const isApprover = await approvalPolicyDAL.isProjectApprover({
      projectId,
      userId: ctx.actorId,
      groupIds: [...userGroupIds],
      type: ApprovalPolicyType.PamAccess,
      scopeType: ApprovalPolicyScope.PamFolder
    });

    // A non-approver can never have requests awaiting their approval.
    if (!isApprover) {
      return { pendingCount: 0, isApprover: false };
    }

    const requests = await approvalRequestDAL.findByProjectId(ApprovalPolicyType.PamAccess, projectId);

    // Phase 1 enforces a single approval step, so matching any step is equivalent to the current step.
    const pendingCount = requests.filter(
      (request) =>
        request.status === ApprovalRequestStatus.Pending &&
        request.steps.some((step) => isUserEligibleApprover(step.approvers, ctx.actorId, userGroupIds))
    ).length;

    return { pendingCount, isApprover: true };
  };

  // The review sheet promises the requester will see the reviewer's comment; the notification
  // center is where that happens, since a decided request disappears from the requester's UI.
  const notifyRequesterOfDecision = async (
    request: { requesterId?: string | null; organizationId: string },
    decision: ApprovalRequestApprovalDecision,
    accountName: string | undefined,
    comment: string | undefined
  ) => {
    if (!request.requesterId) return;
    try {
      const approved = decision === ApprovalRequestApprovalDecision.Approved;
      await notificationService.createUserNotifications([
        {
          userId: request.requesterId,
          orgId: request.organizationId,
          type: NotificationType.ACCESS_APPROVAL_REQUEST_UPDATED,
          title: approved ? "Access request approved" : "Access request denied",
          body: `Your access request for **${accountName ?? "a PAM account"}** was ${
            approved ? "approved" : "denied"
          }.${comment ? ` Reviewer comment: "${comment}"` : ""}`,
          link: `/organizations/${request.organizationId}/pam/accounts`
        }
      ]);
    } catch (err) {
      logger.error(err, "Failed to notify PAM access requester of review decision");
    }
  };

  const reviewRequest = async ({ requestId, projectId, status, comment, ...ctx }: TReviewAccessRequestDTO) => {
    await verifyProductMembership(permissionService, projectId, ctx);

    const request = await approvalRequestDAL.findById(requestId);
    if (!request || request.projectId !== projectId || request.type !== ApprovalPolicyType.PamAccess) {
      throw new NotFoundError({ message: "Request not found" });
    }

    if (request.status !== ApprovalRequestStatus.Pending) {
      throw new BadRequestError({ message: "Request is not pending" });
    }

    if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
      await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Expired });
      throw new BadRequestError({ message: "Request has expired" });
    }

    // Self-approval is a conflict of interest and always blocked. Denying your own request is harmless
    // (it only withdraws your own pending access), so it is allowed.
    if (status === ApprovalRequestApprovalDecision.Approved && request.requesterId === ctx.actorId) {
      throw new ForbiddenRequestError({ message: "You cannot approve your own request" });
    }

    const requestData = request.requestData as { version: number; requestData: TPamAccessRequestData } | null;
    const folderId = requestData?.requestData?.folderId;

    // The request snapshots the account's folder at creation time, but the account may have since been
    // moved or deleted. Approving would then grant access governed by the old folder's approvers,
    // bypassing the account's current folder policy, so block approval of a stale request. Rejection
    // stays allowed so the stale request can be cleared.
    if (status === ApprovalRequestApprovalDecision.Approved) {
      const requestedAccountId = requestData?.requestData?.accountId;
      const account = requestedAccountId ? await pamAccountDAL.findOne({ id: requestedAccountId }) : undefined;
      if (!account || account.projectId !== projectId || account.folderId !== folderId) {
        throw new BadRequestError({
          message: "This request is no longer valid because the account has moved or been removed"
        });
      }
    }

    const steps = await approvalRequestDAL.findStepsByRequestId(requestId);
    const currentStepIndex = steps.findIndex((s) => s.stepNumber === request.currentStep);
    if (currentStepIndex === -1) {
      throw new BadRequestError({ message: "Current step not found" });
    }

    const currentStep = steps[currentStepIndex];

    const userGroupIds = await getUserGroupIds(ctx.actorId, ctx.actorOrgId);

    // The actor must have been an eligible approver on this request's current step (snapshot at creation).
    if (!isUserEligibleApprover(currentStep.approvers, ctx.actorId, userGroupIds)) {
      throw new ForbiddenRequestError({ message: "You are not an eligible approver for this request" });
    }

    // And must still be an approver on the folder's live policy. A missing policy means no one is
    // currently authorized to review, so this is a denial rather than a skip.
    if (folderId) {
      const currentPolicy = await findFolderPolicy(folderId);
      if (!currentPolicy) {
        throw new ForbiddenRequestError({ message: "Approval policy no longer exists for this folder" });
      }
      const currentSteps = await approvalPolicyDAL.findStepsByPolicyId(currentPolicy.id);
      const isCurrentApprover = currentSteps.some((step) =>
        isUserEligibleApprover(step.approvers, ctx.actorId, userGroupIds)
      );
      if (!isCurrentApprover) {
        throw new ForbiddenRequestError({ message: "You are no longer an eligible approver for this folder" });
      }

      // Approver rows are only stripped on explicit removal from the folder, not when a temporary
      // membership lapses, so re-check that the actor still holds an active folder membership.
      const activeMemberships = await findActiveFolderMemberships(projectId, folderId);
      const hasActiveMembership = activeMemberships.some(
        (m) => m.actorUserId === ctx.actorId || (m.actorGroupId && userGroupIds.has(m.actorGroupId))
      );
      if (!hasActiveMembership) {
        throw new ForbiddenRequestError({ message: "You are no longer an eligible approver for this folder" });
      }
    }

    const hasAlreadyReviewed = currentStep.approvals.some(
      (a: { approverUserId: string }) => a.approverUserId === ctx.actorId
    );
    if (hasAlreadyReviewed) {
      throw new BadRequestError({ message: "You have already reviewed this request" });
    }

    if (status === ApprovalRequestApprovalDecision.Rejected) {
      const updatedRequest = await approvalRequestDAL.transaction(async (tx) => {
        // Row lock serializes concurrent reviews; the pre-transaction checks may be stale by now
        const locked = await approvalRequestDAL.findByIdForUpdate(requestId, tx);
        if (!locked || locked.status !== ApprovalRequestStatus.Pending) {
          throw new BadRequestError({ message: "Request is not pending" });
        }
        const lockedStep = steps.find((s) => s.stepNumber === locked.currentStep);
        if (!lockedStep) {
          throw new BadRequestError({ message: "Current step not found" });
        }
        if (!isUserEligibleApprover(lockedStep.approvers, ctx.actorId, userGroupIds)) {
          throw new ForbiddenRequestError({ message: "You are not an eligible approver for this request" });
        }

        await approvalRequestApprovalsDAL.create(
          {
            stepId: lockedStep.id,
            approverUserId: ctx.actorId,
            decision: ApprovalRequestApprovalDecision.Rejected,
            comment
          },
          tx
        );
        await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Rejected }, tx);
        return approvalRequestDAL.findById(requestId, tx);
      });

      const rejectedAccountId = requestData?.requestData?.accountId;
      const rejectedAccount = rejectedAccountId
        ? await pamAccountDAL.findOne({ id: rejectedAccountId, projectId })
        : undefined;
      await notifyRequesterOfDecision(
        updatedRequest,
        ApprovalRequestApprovalDecision.Rejected,
        rejectedAccount?.name,
        comment
      );

      if (folderId) {
        void notifyFolderChannelsOfDecision({
          folderId,
          decision: ApprovalRequestApprovalDecision.Rejected,
          requesterName: request.requesterName,
          requesterEmail: request.requesterEmail,
          accountName: rejectedAccount?.name,
          comment,
          orgId: request.organizationId,
          requestId: request.id
        });
      }

      return { request: updatedRequest, accountId: requestData?.requestData?.accountId, folderId };
    }

    const { updatedRequest, nextStepToNotify } = await approvalRequestDAL.transaction(async (tx) => {
      let nextStep = null;

      // Row lock serializes concurrent approvals; re-check state and re-read the approval count
      // under the lock so two simultaneous approvers can't both complete the step or double-grant
      const locked = await approvalRequestDAL.findByIdForUpdate(requestId, tx);
      if (!locked || locked.status !== ApprovalRequestStatus.Pending) {
        throw new BadRequestError({ message: "Request is not pending" });
      }

      const lockedStepIndex = steps.findIndex((s) => s.stepNumber === locked.currentStep);
      const lockedStep = steps[lockedStepIndex];
      if (!lockedStep) {
        throw new BadRequestError({ message: "Current step not found" });
      }
      if (!isUserEligibleApprover(lockedStep.approvers, ctx.actorId, userGroupIds)) {
        throw new ForbiddenRequestError({ message: "You are not an eligible approver for this request" });
      }

      const stepApprovals = await approvalRequestApprovalsDAL.find({ stepId: lockedStep.id }, { tx });
      if (stepApprovals.some((a) => a.approverUserId === ctx.actorId)) {
        throw new BadRequestError({ message: "You have already reviewed this request" });
      }

      await approvalRequestApprovalsDAL.create(
        {
          stepId: lockedStep.id,
          approverUserId: ctx.actorId,
          decision: ApprovalRequestApprovalDecision.Approved,
          comment
        },
        tx
      );

      const newApprovalCount = stepApprovals.length + 1;
      if (newApprovalCount >= lockedStep.requiredApprovals) {
        await approvalRequestStepsDAL.updateById(
          lockedStep.id,
          { status: ApprovalRequestStepStatus.Completed, completedAt: new Date() },
          tx
        );

        const nextStepData = steps[lockedStepIndex + 1];
        if (nextStepData) {
          await approvalRequestDAL.updateById(requestId, { currentStep: locked.currentStep + 1 }, tx);
          await approvalRequestStepsDAL.updateById(
            nextStepData.id,
            { status: ApprovalRequestStepStatus.InProgress, startedAt: new Date() },
            tx
          );
          nextStep = nextStepData;
        } else {
          await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Approved }, tx);

          if (requestData?.requestData) {
            const durationMs = parseDurationMs(requestData.requestData.duration);
            const expiresAt = new Date(Date.now() + durationMs);
            await approvalRequestGrantsDAL.create(
              {
                projectId: request.projectId,
                requestId: request.id,
                // The request carries exactly one actor column; mirror it onto the grant
                granteeUserId: request.requesterId,
                granteeMachineIdentityId: request.machineIdentityId,
                status: ApprovalRequestGrantStatus.Active,
                type: ApprovalPolicyType.PamAccess,
                attributes: {
                  accountId: requestData.requestData.accountId,
                  folderId: requestData.requestData.folderId
                },
                expiresAt
              },
              tx
            );
          }
        }
      }

      const updated = await approvalRequestDAL.findById(requestId, tx);
      return { updatedRequest: updated, nextStepToNotify: nextStep };
    });

    if (nextStepToNotify) {
      await notifyApproversForStep(
        {
          name: nextStepToNotify.name ?? null,
          requiredApprovals: nextStepToNotify.requiredApprovals,
          notifyApprovers: true,
          approvers: nextStepToNotify.approvers
        },
        updatedRequest,
        { userGroupMembershipDAL, notificationService }
      );
    }

    if (updatedRequest.status === ApprovalRequestStatus.Approved) {
      const approvedAccountId = requestData?.requestData?.accountId;
      const approvedAccount = approvedAccountId
        ? await pamAccountDAL.findOne({ id: approvedAccountId, projectId })
        : undefined;
      await notifyRequesterOfDecision(
        updatedRequest,
        ApprovalRequestApprovalDecision.Approved,
        approvedAccount?.name,
        comment
      );

      if (folderId) {
        void notifyFolderChannelsOfDecision({
          folderId,
          decision: ApprovalRequestApprovalDecision.Approved,
          requesterName: request.requesterName,
          requesterEmail: request.requesterEmail,
          accountName: approvedAccount?.name,
          comment,
          orgId: request.organizationId,
          requestId: request.id
        });
      }
    }

    return { request: updatedRequest, accountId: requestData?.requestData?.accountId, folderId };
  };

  const notifyOfBreakGlass = async ({
    request,
    steps,
    account,
    folderId,
    duration,
    bypassReason,
    actorId,
    orgId
  }: {
    request: { id: string; requesterName?: string | null; requesterEmail?: string | null };
    steps: { approvers: { type: string; id: string }[] }[];
    account: { name: string; folderName: string | null };
    folderId: string;
    duration: string;
    bypassReason: string;
    actorId: string;
    orgId: string;
  }) => {
    try {
      const approverUserIds = new Set<string>();
      const approverGroupIds = new Set<string>();
      for (const step of steps) {
        for (const approver of step.approvers) {
          if (approver.type === ApproverType.User) approverUserIds.add(approver.id);
          else approverGroupIds.add(approver.id);
        }
      }

      const groupMemberLists = await Promise.all(
        [...approverGroupIds].map((groupId) => userGroupMembershipDAL.find({ groupId }))
      );
      groupMemberLists.forEach((members) => members.forEach((m) => approverUserIds.add(m.userId)));
      approverUserIds.delete(actorId);

      if (approverUserIds.size > 0) {
        const approverUsers = await userDAL.find({ $in: { id: [...approverUserIds] } });

        await notificationService.createUserNotifications(
          [...approverUserIds].map((userId) => ({
            userId,
            orgId,
            type: NotificationType.ACCESS_APPROVAL_REQUEST_UPDATED,
            title: "Access approval bypassed",
            body: `**${request.requesterName ?? "A user"}** used break-glass to self-approve access to **${account.name}**. Reason: "${bypassReason}"`
          }))
        );

        const recipients = approverUsers.filter((u) => u.email).map((u) => u.email as string);
        if (recipients.length > 0) {
          await smtpService.sendMail({
            recipients,
            subjectLine: "PAM Access Approval Bypassed",
            template: SmtpTemplates.AccessPamRequestBypassed,
            substitutions: {
              requesterFullName: request.requesterName ?? "A user",
              requesterEmail: request.requesterEmail ?? "",
              resourceName: account.folderName ?? undefined,
              accountName: account.name,
              accessDuration: formatDuration(duration),
              bypassReason
            }
          });
        }
      }
    } catch (err) {
      logger.error(err, `Failed to send PAM break-glass notifications [requestId=${request.id}]`);
    }

    void triggerFolderSlackNotifications({
      folderId,
      event: PamNotificationEvent.AccessRequestBypassed,
      orgId,
      notification: {
        type: TriggerFeature.PAM_ACCESS_REQUEST_BYPASSED,
        payload: {
          requesterFullName: request.requesterName ?? "A user",
          requesterEmail: request.requesterEmail ?? "",
          accountName: account.name,
          folderName: account.folderName ?? "",
          accessDuration: formatDuration(duration),
          bypassReason
        }
      }
    });
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

    if (request.status !== ApprovalRequestStatus.Pending) {
      throw new BadRequestError({ message: "Request is not pending" });
    }

    if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
      await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Expired });
      throw new BadRequestError({ message: "Request has expired" });
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

    const { allowBreakGlass } = resolveAccessControls(account.templatePolicies);
    if (!allowBreakGlass) {
      throw new ForbiddenRequestError({
        message: `Break-glass is not enabled for '${account.name}'. Ask a PAM admin to turn on the Allow Break-Glass policy on its template.`
      });
    }

    const policy = await findFolderPolicy(folderId);
    if (!policy) {
      throw new ForbiddenRequestError({ message: "Approval policy no longer exists for this folder" });
    }

    const userGroupIds = await getUserGroupIds(ctx.actorId, ctx.actorOrgId);
    if (!(await isFolderBreakGlassApprover(policy.id, ctx.actorId, userGroupIds))) {
      throw new ForbiddenRequestError({
        message: "You are not a break-glass approver for this folder"
      });
    }

    const activeMemberships = await findActiveFolderMemberships(projectId, folderId);
    const hasActiveMembership = activeMemberships.some(
      (m) => m.actorUserId === ctx.actorId || (m.actorGroupId && userGroupIds.has(m.actorGroupId))
    );
    if (!hasActiveMembership) {
      throw new ForbiddenRequestError({ message: "You are not a member of this folder" });
    }

    await checkAccountAccess(
      permissionService,
      account.id,
      account.folderId,
      projectId,
      ResourcePermissionPamResourceActions.LaunchSessions,
      ctx
    );

    const steps = await approvalRequestDAL.findStepsByRequestId(requestId);
    const bypassedApproverCount = new Set(steps.flatMap((s) => s.approvers.map((a) => `${a.type}:${a.id}`))).size;
    const durationMs = parseDurationMs(requestData.requestData.duration);

    const { updatedRequest, grant } = await approvalRequestDAL.transaction(async (tx) => {
      const locked = await approvalRequestDAL.findByIdForUpdate(requestId, tx);
      if (!locked || locked.status !== ApprovalRequestStatus.Pending) {
        throw new BadRequestError({ message: "Request is not pending" });
      }

      if (locked.expiresAt && new Date(locked.expiresAt) < new Date()) {
        await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Expired }, tx);
        throw new BadRequestError({ message: "Request has expired" });
      }

      await Promise.all(
        steps.map((step) =>
          approvalRequestStepsDAL.updateById(
            step.id,
            { status: ApprovalRequestStepStatus.Completed, completedAt: new Date() },
            tx
          )
        )
      );

      const currentStep = steps.find((s) => s.stepNumber === locked.currentStep);
      if (currentStep) {
        await approvalRequestApprovalsDAL.create(
          {
            stepId: currentStep.id,
            approverUserId: ctx.actorId,
            decision: ApprovalRequestApprovalDecision.Approved,
            comment: `Break-glass: ${trimmedReason}`
          },
          tx
        );
      }

      await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Approved }, tx);

      const createdGrant = await approvalRequestGrantsDAL.create(
        {
          projectId: request.projectId,
          requestId: request.id,
          granteeUserId: request.requesterId,
          status: ApprovalRequestGrantStatus.Active,
          type: ApprovalPolicyType.PamAccess,
          attributes: { accountId, folderId },
          expiresAt: new Date(Date.now() + durationMs),
          isBreakGlass: true,
          bypassReason: trimmedReason
        },
        tx
      );

      return { updatedRequest: await approvalRequestDAL.findById(requestId, tx), grant: createdGrant };
    });

    void notifyOfBreakGlass({
      request,
      steps,
      account,
      folderId,
      duration: requestData.requestData.duration,
      bypassReason: trimmedReason,
      actorId: ctx.actorId,
      orgId: ctx.actorOrgId
    }).catch((err) => {
      logger.error(err, `Failed to send PAM break-glass notifications [requestId=${requestId}]`);
    });

    return {
      request: updatedRequest,
      accountId,
      folderId,
      accountType: account.accountType,
      grantId: grant.id,
      policyId: policy.id,
      accountName: account.name,
      folderName: account.folderName,
      accessDuration: requestData.requestData.duration,
      approverCount: bypassedApproverCount
    };
  };

  // Marks a grant Revoked and terminates the grantee's live sessions on the granted account.
  //
  // Returns the tunnel-cancellation callback rather than firing it, so a caller that revokes inside a
  // transaction which can still roll back (account deletion) only cuts tunnels once the revocation is
  // durable. Callers outside a transaction invoke it immediately.
  const revokeGrantRow = async (
    grant: TApprovalRequestGrants,
    actorId: string,
    reason: string,
    tx?: Knex
  ): Promise<{ revoked: TApprovalRequestGrants; sendCancellationSignals: () => void }> => {
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

    const noSignals = { revoked, sendCancellationSignals: () => {} };

    // Sessions mirror the grant's actor column: a machine identity session carries identityId with a null
    // userId, so scope the sweep to whichever column the grant was issued to. granteeUserId is SET NULL
    // when the grantee user is deleted, leaving a grant with neither column — filtering on a null userId
    // there would match every machine identity session on the account, so bail instead.
    let granteeFilter: { userId: string } | { identityId: string } | null = null;
    if (grant.granteeMachineIdentityId) granteeFilter = { identityId: grant.granteeMachineIdentityId };
    else if (grant.granteeUserId) granteeFilter = { userId: grant.granteeUserId };

    const attrs = grant.attributes as { accountId?: string } | null;
    if (!attrs?.accountId || !granteeFilter) return noSignals;

    // Cover both active and starting sessions; a session mid-handshake would otherwise slip past
    // revocation and go live. terminateSessionById flips the row, and the ALPN signal cuts the live
    // tunnel, since neither the gateway nor the web-access loop watches the status column.
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
    const sendCancellationSignals = await terminatePamSessions({
      sessions: liveSessions,
      actorId,
      actorEmail: actor?.email ?? "",
      pamSessionDAL,
      gatewayV2Service,
      tx
    });

    return { revoked, sendCancellationSignals };
  };

  const revokeGrant = async ({ requestId, projectId, ...ctx }: TRevokeAccessRequestDTO) => {
    const { hasRole } = await verifyProductMembership(permissionService, projectId, ctx);

    const grant = await approvalRequestGrantsDAL.findOne({
      requestId,
      type: ApprovalPolicyType.PamAccess,
      status: ApprovalRequestGrantStatus.Active
    });

    if (!grant || grant.projectId !== projectId) {
      throw new NotFoundError({ message: "No active approval found for this request" });
    }

    const requestData = (await approvalRequestDAL.findById(requestId))?.requestData as {
      version: number;
      requestData: TPamAccessRequestData;
    } | null;

    const accountId = requestData?.requestData?.accountId;
    const account = accountId ? (await pamAccountDAL.find({ id: accountId, projectId }))[0] : undefined;

    if (account) {
      await checkAccountAccess(
        permissionService,
        account.id,
        account.folderId,
        projectId,
        ResourcePermissionPamResourceActions.RevokeGrants,
        ctx
      );
    } else if (!hasRole(PamProductRole.Admin)) {
      // The grant's account can't be resolved (missing from requestData or already deleted), so there
      // is no resource to check RevokeGrants against. Fail closed to product admins.
      throw new ForbiddenRequestError({ message: "You are not authorized to revoke this approval" });
    }

    const { revoked: revokedGrant, sendCancellationSignals } = await revokeGrantRow(
      grant,
      ctx.actorId,
      "Revoked by admin"
    );
    sendCancellationSignals();

    return { grant: revokedGrant, accountId, folderId: requestData?.requestData?.folderId, grantId: grant.id };
  };

  // Approval policies, requests, and grants reference folders/accounts by scopeId or by a JSON id
  // with no FK, so deleting a folder or account leaves them orphaned. These run inside the folder/
  // account delete transaction to keep the approval state consistent.

  const cleanupFolderResources = async (folderId: string, tx: Knex) => {
    // Deleting the policy cascades to its steps and approvers, which also stops the now-defunct
    // folder from keeping its approvers "active" for approver-eligibility scans.
    const policy = await approvalPolicyDAL.findOne(
      { type: ApprovalPolicyType.PamAccess, scopeType: ApprovalPolicyScope.PamFolder, scopeId: folderId },
      tx
    );
    if (policy) {
      await approvalPolicyDAL.deleteById(policy.id, tx);
    }

    await approvalRequestDAL.update(
      {
        type: ApprovalPolicyType.PamAccess,
        scopeType: ApprovalPolicyScope.PamFolder,
        scopeId: folderId,
        status: ApprovalRequestStatus.Pending
      },
      { status: ApprovalRequestStatus.Cancelled },
      tx
    );
  };

  // Returns the callback that cuts the tunnels of the sessions it terminated. It runs inside the caller's
  // delete transaction, which can still fail, so the signals are the caller's to fire after COMMIT.
  const cleanupAccountResources = async (
    {
      accountId,
      folderId,
      projectId,
      actorId
    }: { accountId: string; folderId: string | null | undefined; projectId: string; actorId: string },
    tx: Knex
  ): Promise<() => void> => {
    // Requests are folder-scoped with the account id in requestData JSON, so filter in memory.
    if (folderId) {
      const pending = await approvalRequestDAL.find(
        {
          type: ApprovalPolicyType.PamAccess,
          scopeType: ApprovalPolicyScope.PamFolder,
          scopeId: folderId,
          status: ApprovalRequestStatus.Pending
        },
        { tx }
      );
      const staleIds = pending
        .filter((r) => {
          const data = r.requestData as { version: number; requestData: TPamAccessRequestData } | null;
          return data?.requestData?.accountId === accountId;
        })
        .map((r) => r.id);
      if (staleIds.length > 0) {
        await approvalRequestDAL.update({ $in: { id: staleIds } }, { status: ApprovalRequestStatus.Cancelled }, tx);
      }
    }

    const activeGrants = await approvalRequestGrantsDAL.find(
      { type: ApprovalPolicyType.PamAccess, status: ApprovalRequestGrantStatus.Active, projectId },
      { tx }
    );
    const pendingSignals: (() => void)[] = [];
    for (const grant of activeGrants) {
      const attrs = grant.attributes as { accountId?: string } | null;
      if (attrs?.accountId === accountId) {
        // eslint-disable-next-line no-await-in-loop
        const { sendCancellationSignals } = await revokeGrantRow(grant, actorId, "Account deleted", tx);
        pendingSignals.push(sendCancellationSignals);
      }
    }

    return () => pendingSignals.forEach((send) => send());
  };

  const checkGrant = async ({
    accountId,
    accountFolderId,
    projectId,
    ...actorCtx
  }: TCheckGrantDTO): Promise<TApprovalRequestGrants | null> => {
    const grants = await approvalRequestGrantsDAL.find({
      ...actorGrantFilter(actorCtx),
      type: ApprovalPolicyType.PamAccess,
      status: ApprovalRequestGrantStatus.Active,
      projectId
    });

    const now = new Date();
    // Match the grant's snapshot folder against the account's CURRENT folder: a grant approved while
    // the account lived in another folder must not authorize launch after the account is moved into a
    // different (gated) folder whose approvers never reviewed it.
    const forAccount = grants.filter((g) => {
      const attrs = g.attributes as { accountId?: string; folderId?: string | null } | null;
      return attrs?.accountId === accountId && (attrs?.folderId ?? null) === (accountFolderId ?? null);
    });
    // Prefer a still-valid grant; otherwise return an expired one (rather than null) so the caller can
    // distinguish "grant expired" from "no grant" and signal PAM_GRANT_EXPIRED vs PAM_APPROVAL_REQUIRED.
    const valid = forAccount.find((g) => !g.expiresAt || new Date(g.expiresAt) > now);
    return valid ?? forAccount[0] ?? null;
  };

  const getAccessStatusBatch = async (
    actorCtx: TAccessRequestActor,
    accountIds: string[],
    projectId: string
  ): Promise<
    Map<string, { accessStatus: PamAccessStatus; grantExpiresAt: Date | null; pendingRequestId: string | null }>
  > => {
    const result = new Map<
      string,
      { accessStatus: PamAccessStatus; grantExpiresAt: Date | null; pendingRequestId: string | null }
    >();
    if (accountIds.length === 0) return result;

    const now = new Date();

    const activeGrants = await approvalRequestGrantsDAL.find({
      ...actorGrantFilter(actorCtx),
      type: ApprovalPolicyType.PamAccess,
      status: ApprovalRequestGrantStatus.Active,
      projectId
    });

    for (const grant of activeGrants) {
      const isExpired = Boolean(grant.expiresAt && new Date(grant.expiresAt) <= now);
      const attrs = grant.attributes as { accountId?: string } | null;
      if (!isExpired && attrs?.accountId && accountIds.includes(attrs.accountId)) {
        result.set(attrs.accountId, {
          accessStatus: PamAccessStatus.Granted,
          grantExpiresAt: grant.expiresAt ? new Date(grant.expiresAt) : null,
          pendingRequestId: null
        });
      }
    }

    const pendingRequests = await approvalRequestDAL.find({
      ...actorRequestFilter(actorCtx),
      type: ApprovalPolicyType.PamAccess,
      status: ApprovalRequestStatus.Pending,
      projectId
    });

    for (const request of pendingRequests) {
      const data = request.requestData as { version: number; requestData: TPamAccessRequestData } | null;
      const acctId = data?.requestData?.accountId;
      if (acctId && accountIds.includes(acctId) && !result.has(acctId)) {
        result.set(acctId, {
          accessStatus: PamAccessStatus.Pending,
          grantExpiresAt: null,
          pendingRequestId: request.id
        });
      }
    }

    return result;
  };

  // A folder counts as "configured" only when its policy has at least one approver, so an
  // empty policy (e.g. after the last approver is removed) surfaces the unavailable flag.
  const getFolderPolicyConfigured = async (folderIds: string[]): Promise<Set<string>> => {
    if (folderIds.length === 0) return new Set();
    const scopeIds = await approvalPolicyDAL.findScopeIdsWithApprovers({
      type: ApprovalPolicyType.PamAccess,
      scopeType: ApprovalPolicyScope.PamFolder,
      scopeIds: folderIds
    });
    return new Set(scopeIds);
  };

  const getBreakGlassApproverFolders = async (
    folderIds: string[],
    actorCtx: TAccessRequestActor,
    orgId: string
  ): Promise<Set<string>> => {
    const result = new Set<string>();
    if (folderIds.length === 0 || actorCtx.actor !== ActorType.USER) return result;

    const policies = await approvalPolicyDAL.find({
      type: ApprovalPolicyType.PamAccess,
      scopeType: ApprovalPolicyScope.PamFolder,
      $in: { scopeId: folderIds }
    });
    if (policies.length === 0) return result;

    const [userGroupIds, bypassersByPolicyId] = await Promise.all([
      getUserGroupIds(actorCtx.actorId, orgId),
      approvalPolicyDAL.findBypassersByPolicyIds(policies.map((p) => p.id))
    ]);

    for (const policy of policies) {
      const isApprover = (bypassersByPolicyId[policy.id] ?? []).some(
        (b) =>
          (b.type === ApproverType.User && b.id === actorCtx.actorId) ||
          (b.type === ApproverType.Group && userGroupIds.has(b.id))
      );
      if (isApprover && policy.scopeId) result.add(policy.scopeId);
    }
    return result;
  };

  // Requesters need to know who to ping for approval, so this is gated on LaunchSessions (the
  // request-access permission) rather than the policy-management check used for the full config.
  const getAccountApprovers = async ({ accountId, projectId, ...ctx }: TGetAccountApproversDTO) => {
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
      ResourcePermissionPamResourceActions.LaunchSessions,
      ctx
    );

    if (!account.folderId) return { steps: [] };
    const policy = await findFolderPolicy(account.folderId);
    const livePolicySteps = policy ? await approvalPolicyDAL.findStepsByPolicyId(policy.id) : [];

    // A pending request is reviewed against its snapshotted approvers AND the live policy, so its
    // workflow shows the intersection; the compose state shows the live policy a new request
    // would snapshot.
    let policySteps = livePolicySteps.map((step) => ({
      requiredApprovals: step.requiredApprovals,
      approvers: step.approvers
    }));

    const pendingRequests = await approvalRequestDAL.find({
      ...actorRequestFilter(ctx),
      type: ApprovalPolicyType.PamAccess,
      status: ApprovalRequestStatus.Pending,
      projectId
    });
    const pendingForAccount = pendingRequests.find((r) => {
      const data = r.requestData as { version: number; requestData: TPamAccessRequestData } | null;
      return data?.requestData?.accountId === account.id;
    });

    if (pendingForAccount) {
      const liveApproverKeys = new Set(
        livePolicySteps.flatMap((step) => step.approvers.map((a) => `${a.type}:${a.id}`))
      );
      const requestSteps = await approvalRequestDAL.findStepsByRequestId(pendingForAccount.id);
      policySteps = requestSteps.map((step) => ({
        requiredApprovals: step.requiredApprovals,
        approvers: step.approvers.filter((a) => liveApproverKeys.has(`${a.type}:${a.id}`))
      }));
    }

    if (policySteps.length === 0) return { steps: [] };

    const approverEntries = policySteps.flatMap((s) => s.approvers);
    const userIds = approverEntries.filter((a) => a.type === ApproverType.User).map((a) => a.id);
    const groupIds = approverEntries.filter((a) => a.type === ApproverType.Group).map((a) => a.id);

    const [users, groups, groupMemberships] = await Promise.all([
      userIds.length > 0 ? userDAL.find({ $in: { id: userIds } }) : [],
      groupIds.length > 0 ? groupDAL.find({ $in: { id: groupIds } }) : [],
      groupIds.length > 0 ? userGroupMembershipDAL.find({ $in: { groupId: groupIds } }) : []
    ]);

    const userNameById = new Map(
      users.map((u) => [
        u.id,
        [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || u.email || "Unknown user"
      ])
    );
    const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
    const groupMemberCounts = new Map<string, number>();
    groupMemberships.forEach((m) => {
      if (m.groupId) groupMemberCounts.set(m.groupId, (groupMemberCounts.get(m.groupId) ?? 0) + 1);
    });

    return {
      steps: policySteps.map((step) => ({
        requiredApprovals: step.requiredApprovals,
        approvers: step.approvers.map((a) =>
          a.type === ApproverType.User
            ? { type: ApproverType.User, name: userNameById.get(a.id) ?? "Unknown user" }
            : {
                type: ApproverType.Group,
                name: groupNameById.get(a.id) ?? "Unknown group",
                memberCount: groupMemberCounts.get(a.id) ?? 0
              }
        )
      }))
    };
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
    reviewRequest,
    revokeGrant,
    checkGrant,
    getAccessStatusBatch,
    getFolderPolicyConfigured,
    getBreakGlassApproverFolders,
    cleanupFolderResources,
    cleanupAccountResources
  };
};
