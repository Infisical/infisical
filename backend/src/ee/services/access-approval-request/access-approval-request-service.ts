import slugify from "@sindresorhus/slugify";
import msFn from "ms";

import { ActionProjectType, ProjectMembershipRole } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { EnforcementLevel } from "@app/lib/types";
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
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TProjectUserAdditionalPrivilegeDALFactory } from "../project-user-additional-privilege/project-user-additional-privilege-dal";
import { ProjectUserAdditionalPrivilegeTemporaryMode } from "../project-user-additional-privilege/project-user-additional-privilege-types";
import { TAccessApprovalRequestDALFactory } from "./access-approval-request-dal";
import { verifyRequestedPermissions } from "./access-approval-request-fns";
import { TAccessApprovalRequestReviewerDALFactory } from "./access-approval-request-reviewer-dal";
import { ApprovalStatus, TAccessApprovalRequestServiceFactory } from "./access-approval-request-types";

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
  accessApprovalPolicyDAL: Pick<TAccessApprovalPolicyDALFactory, "findOne" | "find" | "findLastValidPolicy">;
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

          if (!isRejected && duplicateRequest.status === ApprovalStatus.PENDING) {
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
      const approvalUrl = `${cfg.SITE_URL}/projects/secret-management/${project.id}/approval`;

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

    if (authorUserId) {
      requests = requests.filter((request) => request.requestedByUserId === authorUserId);
    }

    if (envSlug) {
      requests = requests.filter((request) => request.environment === envSlug);
    }

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

    const { policy, environment } = accessApprovalRequest;
    if (policy.deletedAt) {
      throw new BadRequestError({
        message: "The policy associated with this access request has been deleted."
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
                userId: accessApprovalRequest.requestedByUserId,
                projectId: accessApprovalRequest.projectId,
                slug: `requested-privilege-${slugify(alphaNumericNanoId(12))}`,
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
                userId: accessApprovalRequest.requestedByUserId,
                projectId: accessApprovalRequest.projectId,
                slug: `requested-privilege-${slugify(alphaNumericNanoId(12))}`,
                permissions: JSON.stringify(accessApprovalRequest.permissions),
                isTemporary: true, // Explicitly set to true for the privilege
                temporaryMode: ProjectUserAdditionalPrivilegeTemporaryMode.Relative,
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
            { privilegeId: privilegeIdToSet, status: ApprovalStatus.APPROVED },
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
                  environment,
                  approvalUrl: `${cfg.SITE_URL}/projects/secret-management/${project.id}/approval`,
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

    return reviewStatus;
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

    const count = await accessApprovalRequestDAL.getCount({ projectId: project.id, policyId });

    return { count };
  };

  return {
    createAccessApprovalRequest,
    listApprovalRequests,
    reviewAccessRequest,
    getCount
  };
};
