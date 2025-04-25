import slugify from "@sindresorhus/slugify";
import msFn from "ms";

import { ActionProjectType, ProjectMembershipRole } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { triggerWorkflowIntegrationNotification } from "@app/lib/workflow-integrations/trigger-notification";
import { TriggerFeature } from "@app/lib/workflow-integrations/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TMicrosoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import { TProjectMicrosoftTeamsConfigDALFactory } from "@app/services/microsoft-teams/project-microsoft-teams-config-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAccessApprovalPolicyApproverDALFactory } from "../access-approval-policy/access-approval-policy-approver-dal";
import { TAccessApprovalPolicyDALFactory } from "../access-approval-policy/access-approval-policy-dal";
import { TGroupDALFactory } from "../group/group-dal";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { TProjectUserAdditionalPrivilegeDALFactory } from "../project-user-additional-privilege/project-user-additional-privilege-dal";
import { ProjectUserAdditionalPrivilegeTemporaryMode } from "../project-user-additional-privilege/project-user-additional-privilege-types";
import { TAccessApprovalRequestDALFactory } from "./access-approval-request-dal";
import { verifyRequestedPermissions } from "./access-approval-request-fns";
import { TAccessApprovalRequestReviewerDALFactory } from "./access-approval-request-reviewer-dal";
import {
  ApprovalStatus,
  TCreateAccessApprovalRequestDTO,
  TGetAccessRequestCountDTO,
  TListApprovalRequestsDTO,
  TReviewAccessRequestDTO
} from "./access-approval-request-types";

type TSecretApprovalRequestServiceFactoryDep = {
  additionalPrivilegeDAL: Pick<TProjectUserAdditionalPrivilegeDALFactory, "create" | "findById">;
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
  accessApprovalPolicyDAL: Pick<TAccessApprovalPolicyDALFactory, "findOne" | "find">;
  accessApprovalRequestReviewerDAL: Pick<
    TAccessApprovalRequestReviewerDALFactory,
    "create" | "find" | "findOne" | "transaction"
  >;
  groupDAL: Pick<TGroupDALFactory, "findAllGroupPossibleMembers">;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findById">;
  smtpService: Pick<TSmtpService, "sendMail">;
  userDAL: Pick<
    TUserDALFactory,
    "findUserByProjectMembershipId" | "findUsersByProjectMembershipIds" | "find" | "findById"
  >;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  microsoftTeamsService: Pick<TMicrosoftTeamsServiceFactory, "sendNotification">;
  projectMicrosoftTeamsConfigDAL: Pick<TProjectMicrosoftTeamsConfigDALFactory, "getIntegrationDetailsByProject">;
};

export type TAccessApprovalRequestServiceFactory = ReturnType<typeof accessApprovalRequestServiceFactory>;

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
  projectSlackConfigDAL
}: TSecretApprovalRequestServiceFactoryDep) => {
  const createAccessApprovalRequest = async ({
    isTemporary,
    temporaryRange,
    actorId,
    permissions: requestedPermissions,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectSlug,
    note
  }: TCreateAccessApprovalRequestDTO) => {
    const cfg = getConfig();
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    // Anyone can create an access approval request.
    const { membership } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    if (!membership) {
      throw new ForbiddenRequestError({ message: "You are not a member of this project" });
    }

    const requestedByUser = await userDAL.findById(actorId);
    if (!requestedByUser) throw new ForbiddenRequestError({ message: "User not found" });

    await projectDAL.checkProjectUpgradeStatus(project.id);

    const { envSlug, secretPath, accessTypes } = verifyRequestedPermissions({ permissions: requestedPermissions });
    const environment = await projectEnvDAL.findOne({ projectId: project.id, slug: envSlug });

    if (!environment) throw new NotFoundError({ message: `Environment with slug '${envSlug}' not found` });

    const policy = await accessApprovalPolicyDAL.findOne({
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
            .findAllGroupPossibleMembers({
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

          if (!isRejected) {
            throw new BadRequestError({ message: "You already have a pending access request with the same criteria" });
          }
        }
      }
    }

    const approval = await accessApprovalRequestDAL.transaction(async (tx) => {
      const approvalRequest = await accessApprovalRequestDAL.create(
        {
          policyId: policy.id,
          requestedByUserId: actorId,
          temporaryRange: temporaryRange || null,
          permissions: JSON.stringify(requestedPermissions),
          isTemporary,
          note: note || null
        },
        tx
      );

      const requesterFullName = `${requestedByUser.firstName} ${requestedByUser.lastName}`;
      const approvalUrl = `${cfg.SITE_URL}/secret-manager/${project.id}/approval`;

      await triggerWorkflowIntegrationNotification({
        input: {
          notification: {
            type: TriggerFeature.ACCESS_REQUEST,
            payload: {
              projectName: project.name,
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

    return { request: approval };
  };

  const listApprovalRequests = async ({
    projectSlug,
    authorProjectMembershipId,
    envSlug,
    actor,
    actorOrgId,
    actorId,
    actorAuthMethod
  }: TListApprovalRequestsDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const { membership } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    if (!membership) {
      throw new ForbiddenRequestError({ message: "You are not a member of this project" });
    }

    const policies = await accessApprovalPolicyDAL.find({ projectId: project.id });
    let requests = await accessApprovalRequestDAL.findRequestsWithPrivilegeByPolicyIds(policies.map((p) => p.id));

    if (authorProjectMembershipId) {
      requests = requests.filter((request) => request.requestedByUserId === actorId);
    }

    if (envSlug) {
      requests = requests.filter((request) => request.environment === envSlug);
    }

    return { requests };
  };

  const reviewAccessRequest = async ({
    requestId,
    actor,
    status,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TReviewAccessRequestDTO) => {
    const accessApprovalRequest = await accessApprovalRequestDAL.findById(requestId);
    if (!accessApprovalRequest) {
      throw new NotFoundError({ message: `Secret approval request with ID '${requestId}' not found` });
    }

    const { policy } = accessApprovalRequest;
    if (policy.deletedAt) {
      throw new BadRequestError({
        message: "The policy associated with this access request has been deleted."
      });
    }
    if (!policy.allowedSelfApprovals && actorId === accessApprovalRequest.requestedByUserId) {
      throw new BadRequestError({
        message: "Failed to review access approval request. Users are not authorized to review their own request."
      });
    }

    const { membership, hasRole } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: accessApprovalRequest.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    if (!membership) {
      throw new ForbiddenRequestError({ message: "You are not a member of this project" });
    }

    if (
      !hasRole(ProjectMembershipRole.Admin) &&
      accessApprovalRequest.requestedByUserId !== actorId && // The request wasn't made by the current user
      !policy.approvers.find((approver) => approver.userId === actorId) // The request isn't performed by an assigned approver
    ) {
      throw new ForbiddenRequestError({ message: "You are not authorized to approve this request" });
    }

    const existingReviews = await accessApprovalRequestReviewerDAL.find({ requestId: accessApprovalRequest.id });
    if (existingReviews.some((review) => review.status === ApprovalStatus.REJECTED)) {
      throw new BadRequestError({ message: "The request has already been rejected by another reviewer" });
    }

    const reviewStatus = await accessApprovalRequestReviewerDAL.transaction(async (tx) => {
      const review = await accessApprovalRequestReviewerDAL.findOne(
        {
          requestId: accessApprovalRequest.id,
          reviewerUserId: actorId
        },
        tx
      );
      if (!review) {
        const newReview = await accessApprovalRequestReviewerDAL.create(
          {
            status,
            requestId: accessApprovalRequest.id,
            reviewerUserId: actorId
          },
          tx
        );

        const allReviews = [...existingReviews, newReview];

        const approvedReviews = allReviews.filter((r) => r.status === ApprovalStatus.APPROVED);

        // approvals is the required number of approvals. If the number of approved reviews is equal to the number of required approvals, then the request is approved.
        if (approvedReviews.length === policy.approvals) {
          if (accessApprovalRequest.isTemporary && !accessApprovalRequest.temporaryRange) {
            throw new BadRequestError({ message: "Temporary range is required for temporary access" });
          }

          let privilegeId: string | null = null;

          if (!accessApprovalRequest.isTemporary && !accessApprovalRequest.temporaryRange) {
            // Permanent access
            const privilege = await additionalPrivilegeDAL.create(
              {
                userId: accessApprovalRequest.requestedByUserId,
                projectId: accessApprovalRequest.projectId,
                slug: `requested-privilege-${slugify(alphaNumericNanoId(12))}`,
                permissions: JSON.stringify(accessApprovalRequest.permissions)
              },
              tx
            );
            privilegeId = privilege.id;
          } else {
            // Temporary access
            const relativeTempAllocatedTimeInMs = ms(accessApprovalRequest.temporaryRange!);
            const startTime = new Date();

            const privilege = await additionalPrivilegeDAL.create(
              {
                userId: accessApprovalRequest.requestedByUserId,
                projectId: accessApprovalRequest.projectId,
                slug: `requested-privilege-${slugify(alphaNumericNanoId(12))}`,
                permissions: JSON.stringify(accessApprovalRequest.permissions),
                isTemporary: true,
                temporaryMode: ProjectUserAdditionalPrivilegeTemporaryMode.Relative,
                temporaryRange: accessApprovalRequest.temporaryRange!,
                temporaryAccessStartTime: startTime,
                temporaryAccessEndTime: new Date(new Date(startTime).getTime() + relativeTempAllocatedTimeInMs)
              },
              tx
            );
            privilegeId = privilege.id;
          }

          await accessApprovalRequestDAL.updateById(accessApprovalRequest.id, { privilegeId }, tx);
        }

        return newReview;
      }
      throw new BadRequestError({ message: "You have already reviewed this request" });
    });

    return reviewStatus;
  };

  const getCount = async ({ projectSlug, actor, actorAuthMethod, actorId, actorOrgId }: TGetAccessRequestCountDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const { membership } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    if (!membership) {
      throw new ForbiddenRequestError({ message: "You are not a member of this project" });
    }

    const count = await accessApprovalRequestDAL.getCount({ projectId: project.id });

    return { count };
  };

  return {
    createAccessApprovalRequest,
    listApprovalRequests,
    reviewAccessRequest,
    getCount
  };
};
