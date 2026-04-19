import { subject } from "@casl/ability";
import slugify from "@sindresorhus/slugify";
import msFn from "ms";

import { ActionProjectType, ProjectMembershipRole, TemporaryPermissionMode } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { EnforcementLevel } from "@app/lib/types";
import { triggerWorkflowIntegrationNotification } from "@app/lib/workflow-integrations/trigger-notification";
import { TriggerFeature } from "@app/lib/workflow-integrations/types";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TMicrosoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import { TProjectMicrosoftTeamsConfigDALFactory } from "@app/services/microsoft-teams/project-microsoft-teams-config-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAppConnectionDALFactory } from "../../../services/app-connection/app-connection-dal";
import { TNotificationServiceFactory } from "../../../services/notification/notification-service";
import { NotificationType } from "../../../services/notification/notification-types";
import { TAccessApprovalPolicyApproverDALFactory } from "../access-approval-policy/access-approval-policy-approver-dal";
import { TAccessApprovalPolicyDALFactory } from "../access-approval-policy/access-approval-policy-dal";
import { ExternalApprovalType } from "../access-approval-policy/access-approval-policy-enums";
import { TGroupDALFactory } from "../group/group-dal";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import {
  ProjectPermissionApprovalRequestGrantActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "../permission/project-permission";
import { TAccessApprovalRequestDALFactory } from "./access-approval-request-dal";
import { sendAccessRequestToServiceNow } from "./access-approval-request-external-fns";
import { verifyRequestedPermissions } from "./access-approval-request-fns";
import { TAccessApprovalRequestReviewerDALFactory } from "./access-approval-request-reviewer-dal";
import {
  ApprovalStatus,
  TAccessApprovalRequestServiceFactory,
  THandleExternalReviewDTO
} from "./access-approval-request-types";

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
  appConnectionDAL
}: TSecretApprovalRequestServiceFactoryDep): TAccessApprovalRequestServiceFactory => {
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

    const requestedByUser = await userDAL.findById(actorId);
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

    // Check if this is an external approval policy
    const policyWithExternal = policy as typeof policy & {
      externalApprovalType?: string | null;
      appConnectionId?: string | null;
    };
    const isExternalApproval = Boolean(policyWithExternal.externalApprovalType);

    const approval = await accessApprovalRequestDAL.transaction(async (tx) => {
      const parsedMs = policy.requestExpirationTime ? ms(policy.requestExpirationTime) : null;
      const expiresAt = parsedMs && !Number.isNaN(parsedMs) ? new Date(Date.now() + parsedMs) : null;

      // Generate external request ID if this is an external approval
      const externalRequestId = isExternalApproval ? alphaNumericNanoId(32) : null;

      const approvalRequest = await accessApprovalRequestDAL.create(
        {
          policyId: policy.id,
          requestedByUserId: actorId,
          temporaryRange: temporaryRange || null,
          permissions: JSON.stringify(requestedPermissions),
          isTemporary,
          note: note || null,
          expiresAt,
          externalRequestId,
          externalStatus: isExternalApproval ? "pending" : null
        },
        tx
      );

      // If external approval, send to external system
      if (
        isExternalApproval &&
        policyWithExternal.externalApprovalType === ExternalApprovalType.ServiceNow &&
        policyWithExternal.appConnectionId
      ) {
        const appConnection = await appConnectionDAL.findById(policyWithExternal.appConnectionId);
        if (appConnection && appConnection.encryptedCredentials) {
          const callbackUrl = `${cfg.SITE_URL}/api/v1/access-approvals/requests/${approvalRequest.id}/external-review`;
          const requesterName = `${requestedByUser.firstName || ""} ${requestedByUser.lastName || ""}`.trim();

          await sendAccessRequestToServiceNow({
            encryptedCredentials: appConnection.encryptedCredentials,
            orgId: project.orgId,
            projectId: appConnection.projectId,
            payload: {
              request_id: approvalRequest.id,
              external_request_id: externalRequestId!,
              callback_url: callbackUrl,
              request_type: "secret_access",
              project_id: project.id,
              project_name: project.name,
              environment: envSlug,
              secret_path: secretPath,
              permissions: JSON.stringify(requestedPermissions, null, 4),
              requestor_email: requestedByUser.email || "",
              requestor_name: requesterName || requestedByUser.email || "",
              justification: note || null,
              is_temporary: isTemporary,
              temporary_range: temporaryRange || null
            },
            kmsService
          });
        }

        return approvalRequest;
      }

      const requesterFullName = `${requestedByUser.firstName} ${requestedByUser.lastName}`;
      const projectPath = `/organizations/${project.orgId}/projects/secret-management/${project.id}`;
      const approvalPath = `${projectPath}/approval`;
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

      return approvalRequest;
    });

    return { request: approval, projectId: project.id };
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

    const project = await projectDAL.findById(accessApprovalRequest.projectId);

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

    const editedByUser = await userDAL.findById(actorId);

    if (!editedByUser) throw new NotFoundError({ message: "Editing user not found" });

    if (accessApprovalRequest.isTemporary && accessApprovalRequest.temporaryRange) {
      if (ms(temporaryRange) > ms(accessApprovalRequest.temporaryRange)) {
        throw new BadRequestError({ message: "Updated access duration must be less than current access duration" });
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
      const approvalPath = `${projectPath}/approval`;
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

    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const policies = await accessApprovalPolicyDAL.find({ projectId: project.id });
    let requests = await accessApprovalRequestDAL.findRequestsWithPrivilegeByPolicyIds(policies.map((p) => p.id));

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

    const { hasRole } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: accessApprovalRequest.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

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

    const project = await projectDAL.findById(accessApprovalRequest.projectId);
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
        const currentRequestState = await accessApprovalRequestDAL.findById(accessApprovalRequest.id, tx);
        let privilegeIdToSet = currentRequestState?.privilegeId || null;

        if (!privilegeIdToSet) {
          if (accessApprovalRequest.isTemporary && !accessApprovalRequest.temporaryRange) {
            throw new BadRequestError({ message: "Temporary range is required for temporary access" });
          }

          if (!accessApprovalRequest.isTemporary && !accessApprovalRequest.temporaryRange) {
            // Permanent access
            const privilege = await additionalPrivilegeDAL.create(
              {
                actorUserId: accessApprovalRequest.requestedByUserId,
                projectId: accessApprovalRequest.projectId,
                name: `requested-privilege-${slugify(alphaNumericNanoId(12))}`,
                permissions: JSON.stringify(accessApprovalRequest.permissions)
              },
              tx
            );
            privilegeIdToSet = privilege.id;
          } else {
            // Temporary access
            const relativeTempAllocatedTimeInMs = ms(accessApprovalRequest.temporaryRange!);
            const startTime = new Date();

            const privilege = await additionalPrivilegeDAL.create(
              {
                actorUserId: accessApprovalRequest.requestedByUserId,
                projectId: accessApprovalRequest.projectId,
                name: `requested-privilege-${slugify(alphaNumericNanoId(12))}`,
                permissions: JSON.stringify(accessApprovalRequest.permissions),
                isTemporary: true, // Explicitly set to true for the privilege
                temporaryMode: TemporaryPermissionMode.Relative,
                temporaryRange: accessApprovalRequest.temporaryRange!,
                temporaryAccessStartTime: startTime,
                temporaryAccessEndTime: new Date(startTime.getTime() + relativeTempAllocatedTimeInMs)
              },
              tx
            );
            privilegeIdToSet = privilege.id;
          }
          await accessApprovalRequestDAL.updateById(
            accessApprovalRequest.id,
            {
              privilegeId: privilegeIdToSet,
              status: ApprovalStatus.APPROVED,
              approvedAt: new Date(),
              approvedByUserId: actorId
            },
            tx
          );
        }
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

            const approvalPath = `/organizations/${project.orgId}/projects/secret-management/${project.id}/approval`;
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

    return { ...reviewStatus, projectId: accessApprovalRequest.projectId, policyId: accessApprovalRequest.policyId };
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

    const targetUser = await userDAL.findById(accessApprovalRequest.requestedByUserId);
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

    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const count = await accessApprovalRequestDAL.getCount({ projectId: project.id, policyId });

    return { count };
  };

  const handleExternalReview = async ({
    requestId,
    externalRequestId,
    status,
    approverEmail,
    rejectionReason,
    metadata,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod
  }: THandleExternalReviewDTO) => {
    const accessApprovalRequestRaw = await accessApprovalRequestDAL.findById(requestId);
    if (!accessApprovalRequestRaw) {
      throw new NotFoundError({ message: `Access approval request with ID '${requestId}' not found` });
    }

    // Type assertion for external fields
    const accessApprovalRequest = accessApprovalRequestRaw as typeof accessApprovalRequestRaw & {
      externalRequestId?: string | null;
      externalStatus?: string | null;
    };

    // Validate external request ID matches
    if (accessApprovalRequest.externalRequestId !== externalRequestId) {
      throw new BadRequestError({ message: "External request ID mismatch" });
    }

    // Validate policy is external type
    const policyRaw = await accessApprovalPolicyDAL.findOne({ id: accessApprovalRequest.policyId });
    const policy = policyRaw as typeof policyRaw & { externalApprovalType?: string | null };
    if (!policy || !policy.externalApprovalType) {
      throw new BadRequestError({ message: "This policy does not use external approval" });
    }

    // Check permission: actor must have ExternalReview permission
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: accessApprovalRequest.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    if (
      !permission.can(
        ProjectPermissionApprovalRequestGrantActions.ExternalReview,
        ProjectPermissionSub.ApprovalRequestGrants
      )
    ) {
      throw new ForbiddenRequestError({
        message: "You do not have permission to review external access requests"
      });
    }

    // Check idempotency: if already processed, return existing state
    if (accessApprovalRequest.externalStatus !== "pending") {
      return { request: accessApprovalRequest, projectId: accessApprovalRequest.projectId };
    }

    // Get project and environment for privilege creation
    const project = await projectDAL.findById(accessApprovalRequest.projectId);
    if (!project) {
      throw new NotFoundError({ message: "Project not found" });
    }

    const updatedRequest = await accessApprovalRequestDAL.transaction(async (tx) => {
      if (status === "approved") {
        // Parse permissions and create privilege
        const parsedPermissions = accessApprovalRequest.permissions;
        const { envSlug } = verifyRequestedPermissions({ permissions: parsedPermissions });
        const environment = await projectEnvDAL.findOne({ projectId: project.id, slug: envSlug });

        if (!environment) {
          throw new NotFoundError({ message: `Environment with slug '${envSlug}' not found` });
        }

        // Create additional privilege (similar to internal approval logic)
        let privilege;
        if (accessApprovalRequest.isTemporary && accessApprovalRequest.temporaryRange) {
          const relativeTempAllocatedTimeInMs = ms(accessApprovalRequest.temporaryRange);
          const startTime = new Date();

          privilege = await additionalPrivilegeDAL.create(
            {
              actorUserId: accessApprovalRequest.requestedByUserId,
              projectId: project.id,
              name: `external-approval-${slugify(alphaNumericNanoId(12))}`,
              permissions: JSON.stringify(parsedPermissions),
              isTemporary: true,
              temporaryMode: TemporaryPermissionMode.Relative,
              temporaryRange: accessApprovalRequest.temporaryRange,
              temporaryAccessStartTime: startTime,
              temporaryAccessEndTime: new Date(startTime.getTime() + relativeTempAllocatedTimeInMs)
            },
            tx
          );
        } else {
          privilege = await additionalPrivilegeDAL.create(
            {
              actorUserId: accessApprovalRequest.requestedByUserId,
              projectId: project.id,
              name: `external-approval-${slugify(alphaNumericNanoId(12))}`,
              permissions: JSON.stringify(parsedPermissions)
            },
            tx
          );
        }

        return accessApprovalRequestDAL.updateById(
          requestId,
          {
            status: ApprovalStatus.APPROVED,
            externalStatus: "approved",
            externalApprovedAt: new Date(),
            externalApprovedByIdentityId: actorId,
            externalMetadata: metadata ? JSON.stringify(metadata) : null,
            privilegeId: privilege.id,
            approvedAt: new Date()
          },
          tx
        );
      }

      // Handle rejection
      return accessApprovalRequestDAL.updateById(
        requestId,
        {
          status: ApprovalStatus.REJECTED,
          externalStatus: "rejected",
          externalApprovedAt: new Date(),
          externalApprovedByIdentityId: actorId,
          externalMetadata: metadata
            ? JSON.stringify({ ...metadata, rejectionReason, approverEmail })
            : JSON.stringify({ rejectionReason, approverEmail })
        },
        tx
      );
    });

    return { request: updatedRequest, projectId: accessApprovalRequest.projectId };
  };

  return {
    createAccessApprovalRequest,
    updateAccessApprovalRequest,
    listApprovalRequests,
    reviewAccessRequest,
    revokeAccessRequest,
    getCount,
    handleExternalReview
  };
};
