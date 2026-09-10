import { subject } from "@casl/ability";
import msFn from "ms";

import { ActionProjectType, ProjectMembershipRole } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { EnforcementLevel } from "@app/lib/types";
import { triggerWorkflowIntegrationNotification } from "@app/lib/workflow-integrations/trigger-notification";
import { TriggerFeature } from "@app/lib/workflow-integrations/types";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TMicrosoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import { TProjectMicrosoftTeamsConfigDALFactory } from "@app/services/microsoft-teams/project-microsoft-teams-config-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";
import {
  AccessRequestWebhookAction,
  TWebhookActor,
  TWebhookRequestedPermission,
  WebhookEvents
} from "@app/services/webhook/webhook-types";

import { TNotificationServiceFactory } from "../../../services/notification/notification-service";
import { NotificationType } from "../../../services/notification/notification-types";
import { TAccessApprovalPolicyApproverDALFactory } from "../access-approval-policy/access-approval-policy-approver-dal";
import { TAccessApprovalPolicyDALFactory } from "../access-approval-policy/access-approval-policy-dal";
import {
  ExternalApprovalProductType,
  ExternalApprovalRequestStatus
} from "../external-approval/external-approval-enums";
import { TExternalApprovalPolicyDALFactory } from "../external-approval/external-approval-policy-dal";
import { TExternalApprovalQueueFactory } from "../external-approval/external-approval-queue";
import { TExternalApprovalRequestDALFactory } from "../external-approval/external-approval-request-dal";
import { TExternalApprovalServiceFactory } from "../external-approval/external-approval-service";
import { TGroupDALFactory } from "../group/group-dal";
import { flattenActiveRolesFromMemberships } from "../permission/permission-service";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import {
  ProjectPermissionApprovalRequestActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "../permission/project-permission";
import { TAccessApprovalRequestDALFactory } from "./access-approval-request-dal";
import {
  getExternalApprovalProvider,
  grantApprovedRequestPrivilege,
  toExternalApprovalAuditLabels,
  toExternalApprovalProvider,
  verifyRequestedPermissions
} from "./access-approval-request-fns";
import { TAccessApprovalRequestReviewerDALFactory } from "./access-approval-request-reviewer-dal";
import { ApprovalStatus, TAccessApprovalRequestServiceFactory } from "./access-approval-request-types";

type TSecretApprovalRequestServiceFactoryDep = {
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "create" | "findById" | "deleteById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  accessApprovalPolicyApproverDAL: Pick<TAccessApprovalPolicyApproverDALFactory, "find">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  projectDAL: Pick<
    TProjectDALFactory,
    "checkProjectUpgradeStatus" | "findProjectBySlug" | "findProjectWithOrg" | "findById"
  >;
  accessApprovalRequestDAL: Pick<
    TAccessApprovalRequestDALFactory,
    | "create"
    | "find"
    | "findRequestsWithPrivilegeByPolicyIds"
    | "findById"
    | "transaction"
    | "updateById"
    | "findOne"
    | "getCount"
    | "findByIdForUpdate"
  >;
  accessApprovalPolicyDAL: Pick<TAccessApprovalPolicyDALFactory, "findOne" | "find" | "findLastValidPolicy">;
  accessApprovalRequestReviewerDAL: Pick<
    TAccessApprovalRequestReviewerDALFactory,
    "create" | "find" | "findOne" | "transaction" | "delete"
  >;
  groupDAL: Pick<TGroupDALFactory, "findAllGroupPossibleUsers">;
  smtpService: Pick<TSmtpService, "sendMail">;
  userDAL: Pick<
    TUserDALFactory,
    "findUserByProjectMembershipId" | "findUsersByProjectMembershipIds" | "find" | "findById"
  >;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  microsoftTeamsService: Pick<TMicrosoftTeamsServiceFactory, "sendNotification">;
  projectMicrosoftTeamsConfigDAL: Pick<TProjectMicrosoftTeamsConfigDALFactory, "getIntegrationDetailsByProject">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  queueService: Pick<TQueueServiceFactory, "queue">;
  externalApprovalQueue: Pick<TExternalApprovalQueueFactory, "queueExternalApprovalDispatch">;
  externalApprovalRequestDAL: Pick<TExternalApprovalRequestDALFactory, "create" | "updateById" | "update">;
  externalApprovalPolicyDAL: Pick<TExternalApprovalPolicyDALFactory, "findById">;
  externalApprovalService: Pick<
    TExternalApprovalServiceFactory,
    "authorizeExternalReview" | "resolveExternalApprovalDecision" | "canReviewExternalApprovals"
  >;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
};

export const accessApprovalRequestServiceFactory = ({
  groupDAL,
  projectDAL,
  projectEnvDAL,
  permissionService,
  accessApprovalRequestDAL,
  accessApprovalRequestReviewerDAL,
  accessApprovalPolicyDAL,
  accessApprovalPolicyApproverDAL,
  additionalPrivilegeDAL,
  smtpService,
  userDAL,
  kmsService,
  microsoftTeamsService,
  projectMicrosoftTeamsConfigDAL,
  projectSlackConfigDAL,
  notificationService,
  queueService,
  externalApprovalQueue,
  externalApprovalRequestDAL,
  externalApprovalPolicyDAL,
  externalApprovalService,
  appConnectionDAL
}: TSecretApprovalRequestServiceFactoryDep): TAccessApprovalRequestServiceFactory => {
  const $queueAccessRequestWebhook = async ({
    action,
    accessApprovalRequest,
    projectId,
    isBypassed
  }: {
    action: AccessRequestWebhookAction;
    accessApprovalRequest: NonNullable<Awaited<ReturnType<TAccessApprovalRequestDALFactory["findById"]>>>;
    projectId: string;
    isBypassed?: boolean;
  }) => {
    let envSlug: string;
    let secretPath: string;
    let requestedPermissions: TWebhookRequestedPermission[];
    try {
      const verified = verifyRequestedPermissions({ permissions: accessApprovalRequest.permissions });
      envSlug = verified.envSlug;
      secretPath = verified.secretPath;
      requestedPermissions = verified.requestedPermissions;
    } catch (error) {
      logger.warn(
        error,
        `Skipping access request webhook, requested permissions could not be parsed [requestId=${accessApprovalRequest.id}] [action=${action}]`
      );
      return;
    }

    const [project, environment] = await Promise.all([
      projectDAL.findById(projectId),
      projectEnvDAL.findOne({ projectId, slug: envSlug })
    ]);

    if (!project) {
      logger.warn(
        `Skipping access request webhook, project not found [projectId=${projectId}] [requestId=${accessApprovalRequest.id}] [action=${action}]`
      );
      return;
    }

    if (!environment) {
      logger.warn(
        `Access request webhook payload has no environment name, environment not found [projectId=${projectId}] [environmentSlug=${envSlug}] [requestId=${accessApprovalRequest.id}] [action=${action}]`
      );
    }

    const cfg = getConfig();
    const { requestedByUser } = accessApprovalRequest;
    const requestedBy: TWebhookActor | null = accessApprovalRequest.requestedByUserId
      ? {
          type: ActorType.USER,
          id: accessApprovalRequest.requestedByUserId,
          name:
            [requestedByUser?.firstName, requestedByUser?.lastName].filter(Boolean).join(" ") ||
            requestedByUser?.username ||
            "Unknown",
          email: requestedByUser?.email ?? null
        }
      : null;

    await queueService.queue(
      QueueName.SecretWebhook,
      QueueJobs.SecWebhook,
      {
        type: WebhookEvents.AccessRequestModified,
        payload: {
          projectId,
          projectName: project.name,
          environment: envSlug,
          environmentName: environment?.name,
          secretPath,
          action,
          request: {
            id: accessApprovalRequest.id,
            url: `${cfg.SITE_URL}/organizations/${project.orgId}/projects/secret-management/${projectId}/approval?selectedTab=resource-requests&requestId=${accessApprovalRequest.id}`,
            status: accessApprovalRequest.status,
            isBypassed:
              isBypassed ??
              (accessApprovalRequest.policy.enforcementLevel === EnforcementLevel.Soft &&
                accessApprovalRequest.approvedByUser?.userId === accessApprovalRequest.requestedByUserId),
            policy: {
              id: accessApprovalRequest.policy.id,
              name: accessApprovalRequest.policy.name,
              enforcementLevel: accessApprovalRequest.policy.enforcementLevel,
              hasSequencedApprovers: accessApprovalRequest.policy.approvers.some(
                (approver) => (approver.sequence ?? 1) > 1
              )
            },
            requestedAccess: {
              isTemporary: accessApprovalRequest.isTemporary,
              temporaryRange: accessApprovalRequest.temporaryRange || null,
              permissions: requestedPermissions
            },
            requestedBy,
            expiresAt: accessApprovalRequest.expiresAt?.toISOString() ?? null,
            approvedAt: accessApprovalRequest.approvedAt?.toISOString() ?? null,
            revokedAt: accessApprovalRequest.revokedAt?.toISOString() ?? null,
            createdAt: accessApprovalRequest.createdAt.toISOString(),
            updatedAt: accessApprovalRequest.updatedAt.toISOString()
          }
        }
      },
      {
        jobId: `access-request-webhook-${accessApprovalRequest.id}-${alphaNumericNanoId(6)}`,
        removeOnFail: { count: 5 },
        removeOnComplete: true,
        delay: 1000,
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 }
      }
    );
  };

  const $queueExternalApprovalDispatch = async ({
    externalApprovalRequestId,
    accessApprovalRequestId,
    projectId
  }: {
    externalApprovalRequestId: string;
    accessApprovalRequestId: string;
    projectId: string;
  }) => {
    try {
      await externalApprovalQueue.queueExternalApprovalDispatch({
        externalApprovalRequestId,
        accessApprovalRequestId,
        projectId,
        productType: ExternalApprovalProductType.SecretsManagement
      });
      return true;
    } catch (error) {
      logger.error(
        error,
        `Failed to queue external approval dispatch [externalApprovalRequestId=${externalApprovalRequestId}] [requestId=${accessApprovalRequestId}]`
      );
      await externalApprovalRequestDAL
        .updateById(externalApprovalRequestId, { status: ExternalApprovalRequestStatus.FailedDispatch })
        .catch((updateError: unknown) => {
          logger.error(
            updateError,
            `Failed to mark external approval request as failed dispatch [externalApprovalRequestId=${externalApprovalRequestId}]`
          );
        });
      return false;
    }
  };

  const reviewExternalAccessRequest: TAccessApprovalRequestServiceFactory["reviewExternalAccessRequest"] = async ({
    requestId,
    externalId,
    status,
    actor
  }) => {
    const accessApprovalRequest = await accessApprovalRequestDAL.findById(requestId);
    const notFound = () => new NotFoundError({ message: `Access approval request with ID '${requestId}' not found` });
    if (!accessApprovalRequest) throw notFound();

    const project = await projectDAL.findById(accessApprovalRequest.projectId);
    if (!project || project.orgId !== actor.orgId) throw notFound();

    const { policy, externalApproval } = accessApprovalRequest;
    if (!policy.externalApprovalPolicyId || !externalApproval) {
      throw new BadRequestError({ message: "This access request is not under an external approval policy" });
    }

    const externalApprovalPolicy = await externalApprovalService.authorizeExternalReview({
      externalApprovalPolicyId: policy.externalApprovalPolicyId,
      actor
    });

    const canReview = await externalApprovalService.canReviewExternalApprovals({ actor });
    if (!canReview) {
      throw new ForbiddenRequestError({
        message:
          "This identity is missing the Review permission on External Approvals. Grant it on an organization role."
      });
    }

    if (policy.deletedAt) {
      throw new BadRequestError({
        message: "The policy associated with this access request has been deleted."
      });
    }

    if (accessApprovalRequest.expiresAt && new Date() > new Date(accessApprovalRequest.expiresAt)) {
      throw new BadRequestError({ message: "This access request has expired and can no longer be reviewed" });
    }

    const connection = await appConnectionDAL.findById(externalApprovalPolicy.connectionId);

    const result = {
      projectId: accessApprovalRequest.projectId,
      policyId: accessApprovalRequest.policyId,
      externalApprovalRequestId: externalApproval.id,
      externalApprovalPolicyId: policy.externalApprovalPolicyId,
      ...toExternalApprovalProvider(externalApprovalPolicy.type),
      ...toExternalApprovalAuditLabels({
        requestedByUser: accessApprovalRequest.requestedByUser,
        policyName: accessApprovalRequest.policy.name,
        externalId: externalApproval.externalId,
        connectionName: connection?.name
      })
    };

    if (accessApprovalRequest.status !== ApprovalStatus.PENDING) {
      if (accessApprovalRequest.status === status) {
        return { ...result, request: accessApprovalRequest };
      }
      throw new BadRequestError({ message: "The request has been closed" });
    }

    const request = await accessApprovalRequestDAL.transaction(async (tx) => {
      const { alreadyFinalized } = await externalApprovalService.resolveExternalApprovalDecision(
        {
          externalApprovalRequestId: externalApproval.id,
          externalId,
          status
        },
        tx
      );
      if (alreadyFinalized) return accessApprovalRequest;

      if (status === ApprovalStatus.REJECTED) {
        const current = await accessApprovalRequestDAL.findByIdForUpdate(accessApprovalRequest.id, tx);
        if (!current || current.status !== ApprovalStatus.PENDING) {
          throw new BadRequestError({ message: "The request has been closed" });
        }
        return accessApprovalRequestDAL.updateById(accessApprovalRequest.id, { status: ApprovalStatus.REJECTED }, tx);
      }

      return grantApprovedRequestPrivilege(
        {
          accessApprovalRequestDAL,
          additionalPrivilegeDAL,
          accessApprovalRequest,
          approvedByUserId: null,
          bypassReason: null
        },
        tx
      );
    });

    try {
      const reviewed = await accessApprovalRequestDAL.transaction((tx) =>
        accessApprovalRequestDAL.findById(accessApprovalRequest.id, tx)
      );
      if (reviewed) {
        await $queueAccessRequestWebhook({
          action: AccessRequestWebhookAction.Reviewed,
          accessApprovalRequest: reviewed,
          projectId: accessApprovalRequest.projectId,
          isBypassed: false
        });
      } else {
        logger.warn(
          `Skipping access request webhook, request not found [requestId=${accessApprovalRequest.id}] [action=${AccessRequestWebhookAction.Reviewed}]`
        );
      }
    } catch (error) {
      logger.error(
        error,
        `Failed to queue access request webhook [requestId=${accessApprovalRequest.id}] [action=${AccessRequestWebhookAction.Reviewed}]`
      );
    }

    return { ...result, request };
  };

  const retryExternalApprovalDispatch: TAccessApprovalRequestServiceFactory["retryExternalApprovalDispatch"] = async ({
    requestId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }) => {
    const notFound = () => new NotFoundError({ message: `Access approval request with ID '${requestId}' not found` });

    const existing = await accessApprovalRequestDAL.findById(requestId);
    if (!existing) throw notFound();

    const project = await projectDAL.findById(existing.projectId);
    if (!project || project.orgId !== actorOrgId) throw notFound();

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: existing.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    if (!permission.can(ProjectPermissionApprovalRequestActions.Read, ProjectPermissionSub.ApprovalRequests)) {
      throw new ForbiddenRequestError({
        message: "You need the Read permission on Approval Requests in this project to resend an access request."
      });
    }

    const { policy, externalApproval } = existing;
    if (!policy.externalApprovalPolicyId || !externalApproval) {
      throw new BadRequestError({ message: "This access request is not under an external approval policy" });
    }

    if (policy.deletedAt) {
      throw new BadRequestError({
        message: "The policy associated with this access request has been deleted."
      });
    }

    const externalApprovalPolicy = await externalApprovalPolicyDAL.findById(policy.externalApprovalPolicyId);
    if (!externalApprovalPolicy) {
      throw new NotFoundError({
        message: `External approval policy with ID '${policy.externalApprovalPolicyId}' not found`
      });
    }

    const connection = await appConnectionDAL.findById(externalApprovalPolicy.connectionId);

    const result = {
      projectId: existing.projectId,
      policyId: existing.policyId,
      externalApprovalRequestId: externalApproval.id,
      externalApprovalPolicyId: policy.externalApprovalPolicyId,
      ...toExternalApprovalProvider(externalApprovalPolicy.type),
      ...toExternalApprovalAuditLabels({
        requestedByUser: existing.requestedByUser,
        policyName: existing.policy.name,
        externalId: externalApproval.externalId,
        connectionName: connection?.name
      })
    };

    const reset = await accessApprovalRequestDAL.transaction(async (tx) => {
      const accessApprovalRequest = await accessApprovalRequestDAL.findById(requestId, tx);
      if (!accessApprovalRequest) throw notFound();

      if (accessApprovalRequest.expiresAt && new Date() > new Date(accessApprovalRequest.expiresAt)) {
        throw new BadRequestError({ message: "This access request has expired and can no longer be sent for review" });
      }

      if (accessApprovalRequest.status !== ApprovalStatus.PENDING) {
        throw new BadRequestError({ message: "The request has been closed" });
      }

      if (accessApprovalRequest.externalApproval?.status !== ExternalApprovalRequestStatus.FailedDispatch) {
        throw new BadRequestError({
          message: `This request can only be resent after a failed delivery. Its current status is '${accessApprovalRequest.externalApproval?.status ?? "unknown"}'.`
        });
      }

      const updated = await externalApprovalRequestDAL.update(
        { id: accessApprovalRequest.externalApproval.id, status: ExternalApprovalRequestStatus.FailedDispatch },
        { status: ExternalApprovalRequestStatus.PendingDispatch },
        tx
      );

      return updated.length > 0;
    });

    if (!reset) {
      return result;
    }

    const queued = await $queueExternalApprovalDispatch({
      externalApprovalRequestId: result.externalApprovalRequestId,
      accessApprovalRequestId: requestId,
      projectId: result.projectId
    });
    if (!queued) {
      throw new InternalServerError({
        message: "Infisical could not schedule delivery to the external approval system. Try again in a few minutes."
      });
    }

    return result;
  };

  const createAccessApprovalRequest: TAccessApprovalRequestServiceFactory["createAccessApprovalRequest"] = async ({
    isTemporary,
    temporaryRange,
    actorId,
    permissions: requestedPermissions,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectSlug,
    note
  }) => {
    const cfg = getConfig();
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    // Anyone can create an access approval request.
    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const requestedByUser = await requestMemoize(requestMemoKeys.userFindById(actorId), () =>
      userDAL.findById(actorId)
    );
    if (!requestedByUser) throw new ForbiddenRequestError({ message: "User not found" });

    await projectDAL.checkProjectUpgradeStatus(project.id);

    const { envSlug, secretPath, accessTypes } = verifyRequestedPermissions({ permissions: requestedPermissions });
    const environment = await projectEnvDAL.findOne({ projectId: project.id, slug: envSlug });

    if (!environment) throw new NotFoundError({ message: `Environment with slug '${envSlug}' not found` });

    const policy = await accessApprovalPolicyDAL.findLastValidPolicy({
      envId: environment.id,
      secretPath
    });
    if (!policy) {
      throw new NotFoundError({
        message: `No policy in environment with slug '${environment.slug}' and with secret path '${secretPath}' was found.`
      });
    }
    if (policy.deletedAt) {
      throw new BadRequestError({ message: "The policy linked to this request has been deleted" });
    }

    const externalApprovalProvider = policy.externalApprovalPolicyId
      ? await getExternalApprovalProvider(externalApprovalPolicyDAL, policy.externalApprovalPolicyId)
      : undefined;

    // Check if the requested time falls under policy.maxTimePeriod
    if (policy.maxTimePeriod) {
      if (!temporaryRange || ms(temporaryRange) > ms(policy.maxTimePeriod)) {
        throw new BadRequestError({
          message: `Requested access time range is limited to ${policy.maxTimePeriod} by policy`
        });
      }
    }

    const approverIds: string[] = [];
    const approverGroupIds: string[] = [];

    const approvers = await accessApprovalPolicyApproverDAL.find({
      policyId: policy.id
    });

    approvers.forEach((approver) => {
      if (approver.approverUserId) {
        approverIds.push(approver.approverUserId);
      } else if (approver.approverGroupId) {
        approverGroupIds.push(approver.approverGroupId);
      }
    });

    const groupUsers = (
      await Promise.all(
        approverGroupIds.map((groupApproverId) =>
          groupDAL
            .findAllGroupPossibleUsers({
              orgId: actorOrgId,
              groupId: groupApproverId
            })
            .then((group) => group.members)
        )
      )
    ).flat();
    approverIds.push(...groupUsers.filter((user) => user.isPartOfGroup).map((user) => user.id));

    const approverUsers = await userDAL.find({
      $in: {
        id: [...new Set(approverIds)]
      }
    });

    const duplicateRequests = await accessApprovalRequestDAL.find({
      policyId: policy.id,
      requestedByUserId: actorId,
      permissions: JSON.stringify(requestedPermissions),
      isTemporary
    });

    if (duplicateRequests?.length > 0) {
      for await (const duplicateRequest of duplicateRequests) {
        if (duplicateRequest.privilegeId) {
          const privilege = await additionalPrivilegeDAL.findById(duplicateRequest.privilegeId);

          const isExpired = new Date() > new Date(privilege.temporaryAccessEndTime || ("" as string));

          if (!isExpired || !privilege.isTemporary) {
            throw new BadRequestError({ message: "You already have an active privilege with the same criteria" });
          }
        } else {
          const reviewers = await accessApprovalRequestReviewerDAL.find({
            requestId: duplicateRequest.id
          });

          const isRejected = reviewers.some((reviewer) => reviewer.status === ApprovalStatus.REJECTED);
          const isRequestExpired = duplicateRequest.expiresAt && new Date(duplicateRequest.expiresAt) < new Date();

          if (!isRejected && !isRequestExpired && duplicateRequest.status === ApprovalStatus.PENDING) {
            throw new BadRequestError({ message: "You already have a pending access request with the same criteria" });
          }
        }
      }
    }

    const txResult = await accessApprovalRequestDAL.transaction(async (tx) => {
      const parsedMs = policy.requestExpirationTime ? ms(policy.requestExpirationTime) : null;
      const expiresAt = parsedMs && !Number.isNaN(parsedMs) ? new Date(Date.now() + parsedMs) : null;

      const externalApprovalRequest = policy.externalApprovalPolicyId
        ? await externalApprovalRequestDAL.create({ status: ExternalApprovalRequestStatus.PendingDispatch }, tx)
        : null;

      const approvalRequest = await accessApprovalRequestDAL.create(
        {
          policyId: policy.id,
          requestedByUserId: actorId,
          temporaryRange: temporaryRange || null,
          permissions: JSON.stringify(requestedPermissions),
          isTemporary,
          note: note || null,
          expiresAt,
          externalApprovalRequestId: externalApprovalRequest?.id ?? null
        },
        tx
      );

      const requesterFullName = `${requestedByUser.firstName} ${requestedByUser.lastName}`;
      const projectPath = `/organizations/${project.orgId}/projects/secret-management/${project.id}`;
      // Deep-link approvers straight to this request on the Access Requests tab
      const approvalPath = `${projectPath}/approval?selectedTab=resource-requests&requestId=${encodeURIComponent(approvalRequest.id)}`;
      const approvalUrl = `${cfg.SITE_URL}${approvalPath}`;

      await triggerWorkflowIntegrationNotification({
        input: {
          notification: {
            type: TriggerFeature.ACCESS_REQUEST,
            payload: {
              projectName: project.name,
              projectPath,
              requesterFullName,
              isTemporary,
              requesterEmail: requestedByUser.email as string,
              secretPath,
              environment: envSlug,
              permissions: accessTypes,
              approvalUrl,
              note
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
          orgId: actorOrgId,
          type: NotificationType.ACCESS_APPROVAL_REQUEST,
          title: "Access Approval Request",
          body: `**${requesterFullName}** (${requestedByUser.email}) has requested ${isTemporary ? "temporary" : "permanent"} access to **${secretPath}** in the **${envSlug}** environment for project **${project.name}**.`,
          link: approvalPath
        }))
      );

      if (!externalApprovalRequest) {
        await smtpService.sendMail({
          recipients: approverUsers.filter((approver) => approver.email).map((approver) => approver.email!),
          subjectLine: "Access Approval Request",

          substitutions: {
            projectName: project.name,
            requesterFullName,
            requesterEmail: requestedByUser.email,
            isTemporary,
            ...(isTemporary && {
              expiresIn: msFn(ms(temporaryRange || ""), { long: true })
            }),
            secretPath,
            environment: envSlug,
            permissions: accessTypes,
            approvalUrl,
            note
          },
          template: SmtpTemplates.AccessApprovalRequest
        });
      }

      return { approvalRequest, externalApprovalRequestId: externalApprovalRequest?.id ?? null };
    });
    const approval = txResult.approvalRequest;
    const { externalApprovalRequestId } = txResult;

    try {
      const created = await accessApprovalRequestDAL.transaction((tx) =>
        accessApprovalRequestDAL.findById(approval.id, tx)
      );
      if (created) {
        await $queueAccessRequestWebhook({
          action: AccessRequestWebhookAction.Created,
          accessApprovalRequest: created,
          projectId: project.id
        });
      } else {
        logger.warn(
          `Skipping access request webhook, request not found [requestId=${approval.id}] [action=${AccessRequestWebhookAction.Created}]`
        );
      }
    } catch (error) {
      logger.error(
        error,
        `Failed to queue access request webhook [requestId=${approval.id}] [action=${AccessRequestWebhookAction.Created}]`
      );
    }

    if (externalApprovalRequestId) {
      await $queueExternalApprovalDispatch({
        externalApprovalRequestId,
        accessApprovalRequestId: approval.id,
        projectId: project.id
      });
    }

    return { request: approval, projectId: project.id, ...externalApprovalProvider };
  };

  const updateAccessApprovalRequest: TAccessApprovalRequestServiceFactory["updateAccessApprovalRequest"] = async ({
    temporaryRange,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    editNote,
    requestId
  }) => {
    const cfg = getConfig();

    const accessApprovalRequest = await accessApprovalRequestDAL.findById(requestId);
    if (!accessApprovalRequest) {
      throw new NotFoundError({ message: `Access request with ID '${requestId}' not found` });
    }

    const { policy, requestedByUser } = accessApprovalRequest;
    if (policy.deletedAt) {
      throw new BadRequestError({
        message: "The policy associated with this access request has been deleted."
      });
    }

    const { hasRole } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: accessApprovalRequest.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const isApprover = policy.approvers.find((approver) => approver.userId === actorId);

    if (!hasRole(ProjectMembershipRole.Admin) && !isApprover) {
      throw new ForbiddenRequestError({ message: "You are not authorized to modify this request" });
    }

    const project = await requestMemoize(requestMemoKeys.projectFindById(accessApprovalRequest.projectId), () =>
      projectDAL.findById(accessApprovalRequest.projectId)
    );

    if (!project) {
      throw new NotFoundError({
        message: `The project associated with this access request was not found. [projectId=${accessApprovalRequest.projectId}]`
      });
    }

    if (accessApprovalRequest.status !== ApprovalStatus.PENDING) {
      throw new BadRequestError({ message: "The request has been closed" });
    }

    if (accessApprovalRequest.expiresAt && new Date(accessApprovalRequest.expiresAt) < new Date()) {
      throw new BadRequestError({ message: "This access request has expired" });
    }

    const editedByUser = await requestMemoize(requestMemoKeys.userFindById(actorId), () => userDAL.findById(actorId));

    if (!editedByUser) throw new NotFoundError({ message: "Editing user not found" });

    if (accessApprovalRequest.isTemporary && accessApprovalRequest.temporaryRange) {
      if (ms(temporaryRange) > ms(accessApprovalRequest.temporaryRange)) {
        throw new BadRequestError({ message: "Updated access duration must be less than current access duration" });
      }
    }

    if (policy.maxTimePeriod) {
      if (ms(temporaryRange) > ms(policy.maxTimePeriod)) {
        throw new BadRequestError({
          message: `Requested access time range is limited to ${policy.maxTimePeriod} by policy`
        });
      }
    }

    let envSlug = "unknown";
    let secretPath = "/";
    let accessTypes: string[] = [];
    try {
      const verified = verifyRequestedPermissions({ permissions: accessApprovalRequest.permissions });
      envSlug = verified.envSlug;
      secretPath = verified.secretPath;
      accessTypes = verified.accessTypes;
    } catch {
      // Legacy request with mismatched permissions -- allow update to proceed with fallback values for notifications
    }

    const approval = await accessApprovalRequestDAL.transaction(async (tx) => {
      const approvalRequest = await accessApprovalRequestDAL.updateById(
        requestId,
        {
          temporaryRange,
          isTemporary: true,
          editNote,
          editedByUserId: actorId
        },
        tx
      );

      // reset review progress
      await accessApprovalRequestReviewerDAL.delete(
        {
          requestId
        },
        tx
      );

      const requesterFullName = `${requestedByUser.firstName} ${requestedByUser.lastName}`;
      const editorFullName = `${editedByUser.firstName} ${editedByUser.lastName}`;
      const projectPath = `/organizations/${project.orgId}/projects/secret-management/${project.id}`;
      // Deep-link approvers straight to this request on the Access Requests tab
      const approvalPath = `${projectPath}/approval?selectedTab=resource-requests&requestId=${encodeURIComponent(requestId)}`;
      const approvalUrl = `${cfg.SITE_URL}${approvalPath}`;

      await triggerWorkflowIntegrationNotification({
        input: {
          notification: {
            type: TriggerFeature.ACCESS_REQUEST_UPDATED,
            payload: {
              projectName: project.name,
              requesterFullName,
              isTemporary: true,
              requesterEmail: requestedByUser.email as string,
              secretPath,
              environment: envSlug,
              permissions: accessTypes,
              approvalUrl,
              editNote,
              editorEmail: editedByUser.email as string,
              editorFullName,
              projectPath
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
        policy.approvers
          .filter((approver) => Boolean(approver.userId) && approver.userId !== editedByUser.id)
          .map((approver) => ({
            userId: approver.userId!,
            orgId: actorOrgId,
            type: NotificationType.ACCESS_APPROVAL_REQUEST_UPDATED,
            title: "Access Approval Request Updated",
            body: `**${editorFullName}** (${editedByUser.email}) has updated the access request submitted by **${requesterFullName}** (${requestedByUser.email}) for **${secretPath}** in the **${envSlug}** environment for project **${project.name}**.`,
            link: approvalPath
          }))
      );

      const recipients = policy.approvers
        .filter((approver) => Boolean(approver.email) && approver.userId !== editedByUser.id)
        .map((approver) => approver.email!);

      if (recipients.length > 0) {
        await smtpService.sendMail({
          recipients,
          subjectLine: "Access Approval Request Updated",
          substitutions: {
            projectName: project.name,
            requesterFullName,
            requesterEmail: requestedByUser.email,
            isTemporary: true,
            expiresIn: msFn(ms(temporaryRange || ""), { long: true }),
            secretPath,
            environment: envSlug,
            permissions: accessTypes,
            approvalUrl,
            editNote,
            editorFullName,
            editorEmail: editedByUser.email
          },
          template: SmtpTemplates.AccessApprovalRequestUpdated
        });
      }

      return approvalRequest;
    });

    try {
      const edited = await accessApprovalRequestDAL.transaction((tx) =>
        accessApprovalRequestDAL.findById(requestId, tx)
      );
      if (edited) {
        await $queueAccessRequestWebhook({
          action: AccessRequestWebhookAction.Edited,
          accessApprovalRequest: edited,
          projectId: accessApprovalRequest.projectId
        });
      } else {
        logger.warn(
          `Skipping access request webhook, request not found [requestId=${requestId}] [action=${AccessRequestWebhookAction.Edited}]`
        );
      }
    } catch (error) {
      logger.error(
        error,
        `Failed to queue access request webhook [requestId=${requestId}] [action=${AccessRequestWebhookAction.Edited}]`
      );
    }

    return { request: approval, projectId: accessApprovalRequest.projectId };
  };

  const listApprovalRequests: TAccessApprovalRequestServiceFactory["listApprovalRequests"] = async ({
    projectSlug,
    authorUserId,
    envSlug,
    actor,
    actorOrgId,
    actorId,
    actorAuthMethod
  }) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const canReadAllApprovalRequests = permission.can(
      ProjectPermissionApprovalRequestActions.Read,
      ProjectPermissionSub.ApprovalRequests
    );

    const policies = await accessApprovalPolicyDAL.find({ projectId: project.id });
    let requests = await accessApprovalRequestDAL.findRequestsWithPrivilegeByPolicyIds(policies.map((p) => p.id));

    if (!canReadAllApprovalRequests) {
      requests = requests.filter((request) => request.requestedByUserId === actorId);
    }

    if (authorUserId) {
      requests = requests.filter((request) => request.requestedByUserId === authorUserId);
    }

    if (envSlug) {
      requests = requests.filter((request) => request.environment === envSlug);
    }

    requests = requests.map((request) => {
      try {
        const { envSlug: requestEnvSlug } = verifyRequestedPermissions({ permissions: request.permissions });
        request.environmentName = requestEnvSlug;
      } catch {
        // Leave environmentName as-is if permissions are malformed (legacy data)
      }
      return request;
    });

    return { requests };
  };

  const reviewAccessRequest: TAccessApprovalRequestServiceFactory["reviewAccessRequest"] = async ({
    requestId,
    actor,
    status,
    actorId,
    actorAuthMethod,
    actorOrgId,
    bypassReason
  }) => {
    const accessApprovalRequest = await accessApprovalRequestDAL.findById(requestId);
    if (!accessApprovalRequest) {
      throw new NotFoundError({ message: `Secret approval request with ID '${requestId}' not found` });
    }

    const { policy, environments, permissions } = accessApprovalRequest;
    if (policy.deletedAt) {
      throw new BadRequestError({
        message: "The policy associated with this access request has been deleted."
      });
    }

    if (policy.externalApprovalPolicyId) {
      throw new BadRequestError({
        message: `Access request for policy '${policy.name}' is reviewed by an external approval system. Approve or reject it there; access is granted automatically once it is approved.`
      });
    }

    // Validate permissions strictly when approving. Legacy requests with mismatched
    // env/paths will fail here, but can still be rejected to clear them out
    let permissionEnvironment: string | undefined;
    try {
      const verified = verifyRequestedPermissions({ permissions });
      permissionEnvironment = verified.envSlug;
    } catch (err) {
      if (status === ApprovalStatus.APPROVED) {
        throw err;
      }
    }

    if (permissionEnvironment && !environments.includes(permissionEnvironment) && status === ApprovalStatus.APPROVED) {
      throw new BadRequestError({
        message: `The original policy ${policy.name} is not attached to environment '${permissionEnvironment}'.`
      });
    }
    const environment = permissionEnvironment
      ? await projectEnvDAL.findOne({
          projectId: accessApprovalRequest.projectId,
          slug: permissionEnvironment
        })
      : undefined;

    const { hasRole, memberships } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: accessApprovalRequest.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    // A user whose only active project role is NoAccess is not authorized to review the request,
    // even with a break-glass approval. If they also hold another active role (e.g. via a group),
    // allow the review to proceed.
    const activeRoles = flattenActiveRolesFromMemberships(memberships, ProjectMembershipRole.Custom);
    const hasOnlyNoAccessRole =
      activeRoles.length > 0 && activeRoles.every((r) => r.role === ProjectMembershipRole.NoAccess);

    if (hasOnlyNoAccessRole) {
      throw new ForbiddenRequestError({ message: "You are not authorized to review this request" });
    }

    const isSelfApproval = actorId === accessApprovalRequest.requestedByUserId;
    const isSoftEnforcement = policy.enforcementLevel === EnforcementLevel.Soft;
    const canBypass = !policy.bypassers.length || policy.bypassers.some((bypasser) => bypasser.userId === actorId);
    const cannotBypassUnderSoftEnforcement = !(isSoftEnforcement && canBypass);

    // Calculate break glass attempt before sequence checks
    const isBreakGlassApprovalAttempt =
      policy.enforcementLevel === EnforcementLevel.Soft &&
      actorId === accessApprovalRequest.requestedByUserId &&
      status === ApprovalStatus.APPROVED;

    const isApprover = policy.approvers.find((approver) => approver.userId === actorId);

    const isSelfRejection = isSelfApproval && status === ApprovalStatus.REJECTED;

    const isBypasser = policy.bypassers.some((bypasser) => bypasser.userId === actorId);

    if (isSelfApproval && status === ApprovalStatus.APPROVED && !policy.allowedSelfApprovals && !isBypasser) {
      throw new BadRequestError({
        message: "Failed to review access approval request. Users are not authorized to review their own request."
      });
    }

    // users can always reject (cancel) their own requests
    if (!isSelfRejection) {
      // If user is (not an approver OR cant self approve) AND can't bypass policy
      if ((!isApprover || (!policy.allowedSelfApprovals && isSelfApproval)) && cannotBypassUnderSoftEnforcement) {
        throw new BadRequestError({
          message: "Failed to review access approval request. Users are not authorized to review their own request."
        });
      }
    }

    if (
      !hasRole(ProjectMembershipRole.Admin) &&
      accessApprovalRequest.requestedByUserId !== actorId && // The request wasn't made by the current user
      !isApprover // The request isn't performed by an assigned approver
    ) {
      throw new ForbiddenRequestError({ message: "You are not authorized to approve this request" });
    }

    const project = await requestMemoize(requestMemoKeys.projectFindById(accessApprovalRequest.projectId), () =>
      projectDAL.findById(accessApprovalRequest.projectId)
    );
    if (!project) {
      throw new NotFoundError({ message: "The project associated with this access request was not found." });
    }

    const existingReviews = await accessApprovalRequestReviewerDAL.find({ requestId: accessApprovalRequest.id });
    if (accessApprovalRequest.status !== ApprovalStatus.PENDING) {
      throw new BadRequestError({ message: "The request has been closed" });
    }

    if (accessApprovalRequest.expiresAt && new Date() > new Date(accessApprovalRequest.expiresAt)) {
      throw new BadRequestError({ message: "This access request has expired and can no longer be reviewed" });
    }

    const reviewsGroupById = groupBy(
      existingReviews.filter((review) => review.status === ApprovalStatus.APPROVED),
      (i) => i.reviewerUserId
    );

    const approvedSequences = policy.approvers.reduce(
      (acc, curr) => {
        const hasApproved = reviewsGroupById?.[curr.userId as string]?.[0];
        if (acc?.[acc.length - 1]?.step === curr.sequence) {
          if (hasApproved) {
            acc[acc.length - 1].approvals += 1;
          }
          return acc;
        }

        acc.push({
          step: curr.sequence || 1,
          approvals: hasApproved ? 1 : 0,
          requiredApprovals: curr.approvalsRequired || 1
        });
        return acc;
      },
      [] as { step: number; approvals: number; requiredApprovals: number }[]
    );
    const presentSequence = approvedSequences.find((el) => el.approvals < el.requiredApprovals) || {
      step: 1,
      approvals: 0,
      requiredApprovals: 1
    };
    if (presentSequence) {
      const isApproverOfTheSequence = policy.approvers.find(
        (el) => el.sequence === presentSequence.step && el.userId === actorId
      );

      // Only throw if actor is not the approver and not bypassing
      if (!isApproverOfTheSequence && !isBreakGlassApprovalAttempt && !isSelfRejection) {
        throw new BadRequestError({ message: "You are not a reviewer in this step" });
      }
    }

    const reviewStatus = await accessApprovalRequestReviewerDAL.transaction(async (tx) => {
      let reviewForThisActorProcessing: {
        id: string;
        requestId: string;
        reviewerUserId: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
      };

      const existingReviewByActorInTx = await accessApprovalRequestReviewerDAL.findOne(
        {
          requestId: accessApprovalRequest.id,
          reviewerUserId: actorId
        },
        tx
      );

      // Check if review exists for actor
      if (existingReviewByActorInTx) {
        // Check if breakglass re-approval
        if (isBreakGlassApprovalAttempt && existingReviewByActorInTx.status === ApprovalStatus.APPROVED) {
          reviewForThisActorProcessing = existingReviewByActorInTx;
        } else {
          throw new BadRequestError({ message: "You have already reviewed this request" });
        }
      } else {
        reviewForThisActorProcessing = await accessApprovalRequestReviewerDAL.create(
          {
            status,
            requestId: accessApprovalRequest.id,
            reviewerUserId: actorId
          },
          tx
        );
      }

      if (status === ApprovalStatus.REJECTED) {
        await accessApprovalRequestDAL.updateById(accessApprovalRequest.id, { status: ApprovalStatus.REJECTED }, tx);
        return reviewForThisActorProcessing;
      }

      const meetsStandardApprovalThreshold =
        (presentSequence?.approvals || 0) + 1 >= presentSequence.requiredApprovals &&
        approvedSequences.at(-1)?.step === presentSequence?.step;

      if (
        reviewForThisActorProcessing.status === ApprovalStatus.APPROVED &&
        (meetsStandardApprovalThreshold || isBreakGlassApprovalAttempt)
      ) {
        await grantApprovedRequestPrivilege(
          {
            accessApprovalRequestDAL,
            additionalPrivilegeDAL,
            accessApprovalRequest,
            approvedByUserId: actorId,
            bypassReason: isBreakGlassApprovalAttempt ? bypassReason || null : null
          },
          tx
        );
      }

      // Send notification if this was a breakglass approval
      if (isBreakGlassApprovalAttempt) {
        const cfg = getConfig();
        const actingUser = await userDAL.findById(actorId, tx);

        if (actingUser) {
          const policyApproverUserIds = policy.approvers
            .map((ap) => ap.userId)
            .filter((id): id is string => typeof id === "string");

          if (policyApproverUserIds.length > 0) {
            const approverUsersForEmail = await userDAL.find({ $in: { id: policyApproverUserIds } }, { tx });
            const recipientEmails = approverUsersForEmail
              .map((appUser) => appUser.email)
              .filter((email): email is string => !!email);

            // Deep-link approvers straight to this request on the Access Requests tab
            const approvalPath = `/organizations/${project.orgId}/projects/secret-management/${project.id}/approval?selectedTab=resource-requests&requestId=${encodeURIComponent(accessApprovalRequest.id)}`;
            const approvalUrl = `${cfg.SITE_URL}${approvalPath}`;

            await notificationService.createUserNotifications(
              approverUsersForEmail.map((approver) => ({
                userId: approver.id,
                orgId: actorOrgId,
                type: NotificationType.ACCESS_POLICY_BYPASSED,
                title: "Secret Access Policy Bypassed",
                body: `**${actingUser.firstName} ${actingUser.lastName}** (${actingUser.email}) has accessed a secret in **${policy.secretPath || "/"}** in the **${environment?.name || permissionEnvironment}** environment for project **${project.name}** without obtaining the required approval.`,
                link: approvalPath
              }))
            );

            if (recipientEmails.length > 0) {
              await smtpService.sendMail({
                recipients: recipientEmails,
                subjectLine: "Infisical Secret Access Policy Bypassed",
                substitutions: {
                  projectName: project.name,
                  requesterFullName: `${actingUser.firstName} ${actingUser.lastName}`,
                  requesterEmail: actingUser.email,
                  bypassReason: bypassReason || "No reason provided",
                  secretPath: policy.secretPath || "/",
                  environment: environment?.name || permissionEnvironment,
                  approvalUrl,
                  requestType: "access"
                },
                template: SmtpTemplates.AccessSecretRequestBypassed
              });
            }
          }
        }
      }
      return reviewForThisActorProcessing;
    });

    try {
      const reviewed = await accessApprovalRequestDAL.transaction((tx) =>
        accessApprovalRequestDAL.findById(accessApprovalRequest.id, tx)
      );
      if (reviewed) {
        await $queueAccessRequestWebhook({
          action: AccessRequestWebhookAction.Reviewed,
          accessApprovalRequest: reviewed,
          projectId: accessApprovalRequest.projectId,
          // The helper otherwise infers this from the policy and the approver. The flag the review
          // itself acted on is authoritative, so pass it rather than re-deriving it.
          isBypassed: isBreakGlassApprovalAttempt
        });
      } else {
        logger.warn(
          `Skipping access request webhook, request not found [requestId=${accessApprovalRequest.id}] [action=${AccessRequestWebhookAction.Reviewed}]`
        );
      }
    } catch (error) {
      logger.error(
        error,
        `Failed to queue access request webhook [requestId=${accessApprovalRequest.id}] [action=${AccessRequestWebhookAction.Reviewed}]`
      );
    }

    return {
      ...reviewStatus,
      projectId: accessApprovalRequest.projectId,
      policyId: accessApprovalRequest.policyId,
      isBypass: isBreakGlassApprovalAttempt
    };
  };

  const revokeAccessRequest: TAccessApprovalRequestServiceFactory["revokeAccessRequest"] = async ({
    requestId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }) => {
    const accessApprovalRequest = await accessApprovalRequestDAL.findById(requestId);
    if (!accessApprovalRequest)
      throw new NotFoundError({ message: `Access approval request with ID '${requestId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: accessApprovalRequest.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const targetUser = await requestMemoize(requestMemoKeys.userFindById(accessApprovalRequest.requestedByUserId), () =>
      userDAL.findById(accessApprovalRequest.requestedByUserId)
    );
    if (!targetUser) throw new NotFoundError({ message: "Target user not found" });

    const memberSubject = subject(ProjectPermissionSub.Member, {
      userEmail: targetUser.email ?? undefined
    });

    const canAssignAdditionalPrivileges = permission.can(
      ProjectPermissionMemberActions.AssignAdditionalPrivileges,
      memberSubject
    );
    const canGrantPrivilegesLegacy = permission.can(ProjectPermissionMemberActions.GrantPrivileges, memberSubject);
    const isApprover = accessApprovalRequest.policy.approvers.some((approver) => approver.userId === actorId);

    if (!canAssignAdditionalPrivileges && !canGrantPrivilegesLegacy && !isApprover) {
      throw new ForbiddenRequestError({
        message: "You do not have permission to revoke additional privileges for this user"
      });
    }

    if (accessApprovalRequest.status !== ApprovalStatus.APPROVED) {
      throw new BadRequestError({ message: "Only approved requests can be revoked" });
    }

    const updatedRequest = await accessApprovalRequestDAL.transaction(async (tx) => {
      const result = await accessApprovalRequestDAL.updateById(
        requestId,
        {
          status: ApprovalStatus.REVOKED,
          revokedAt: new Date(),
          revokedByUserId: actorId,
          privilegeId: null
        },
        tx
      );

      if (accessApprovalRequest.privilegeId) {
        await additionalPrivilegeDAL.deleteById(accessApprovalRequest.privilegeId, tx);
      }

      return result;
    });

    try {
      const revoked = await accessApprovalRequestDAL.transaction((tx) =>
        accessApprovalRequestDAL.findById(requestId, tx)
      );
      if (revoked) {
        await $queueAccessRequestWebhook({
          action: AccessRequestWebhookAction.Revoked,
          accessApprovalRequest: revoked,
          projectId: accessApprovalRequest.projectId
        });
      } else {
        logger.warn(
          `Skipping access request webhook, request not found [requestId=${requestId}] [action=${AccessRequestWebhookAction.Revoked}]`
        );
      }
    } catch (error) {
      logger.error(
        error,
        `Failed to queue access request webhook [requestId=${requestId}] [action=${AccessRequestWebhookAction.Revoked}]`
      );
    }

    return { request: updatedRequest, projectId: accessApprovalRequest.projectId };
  };

  const getCount: TAccessApprovalRequestServiceFactory["getCount"] = async ({
    projectSlug,
    policyId,
    actor,
    actorAuthMethod,
    actorId,
    actorOrgId
  }) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const canReadAllApprovalRequests = permission.can(
      ProjectPermissionApprovalRequestActions.Read,
      ProjectPermissionSub.ApprovalRequests
    );

    const count = await accessApprovalRequestDAL.getCount({
      projectId: project.id,
      policyId,
      requestedByUserId: canReadAllApprovalRequests ? undefined : actorId
    });

    return { count };
  };

  return {
    createAccessApprovalRequest,
    updateAccessApprovalRequest,
    listApprovalRequests,
    reviewAccessRequest,
    reviewExternalAccessRequest,
    retryExternalApprovalDispatch,
    revokeAccessRequest,
    getCount
  };
};
