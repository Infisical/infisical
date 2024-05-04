import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";
import ms from "ms";

import { ProjectMembershipRole, TProjectUserAdditionalPrivilege } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAccessApprovalPolicyApproverDALFactory } from "../access-approval-policy/access-approval-policy-approver-dal";
import { TAccessApprovalPolicyDALFactory } from "../access-approval-policy/access-approval-policy-dal";
import { verifyApprovers } from "../access-approval-policy/access-approval-policy-fns";
import { TGroupProjectUserAdditionalPrivilegeDALFactory } from "../group-project-user-additional-privilege/group-project-user-additional-privilege-dal";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TProjectUserAdditionalPrivilegeDALFactory } from "../project-user-additional-privilege/project-user-additional-privilege-dal";
import { ProjectUserAdditionalPrivilegeTemporaryMode } from "../project-user-additional-privilege/project-user-additional-privilege-types";
import { TAccessApprovalRequestDALFactory } from "./access-approval-request-dal";
import { verifyRequestedPermissions } from "./access-approval-request-fns";
import { TAccessApprovalRequestReviewerDALFactory } from "./access-approval-request-reviewer-dal";
import {
  ApprovalStatus,
  TCreateAccessApprovalRequestDTO,
  TDeleteApprovalRequestDTO,
  TGetAccessRequestCountDTO,
  TListApprovalRequestsDTO,
  TReviewAccessRequestDTO
} from "./access-approval-request-types";

type TAccessApprovalRequestServiceFactoryDep = {
  additionalPrivilegeDAL: Pick<TProjectUserAdditionalPrivilegeDALFactory, "create" | "findById" | "deleteById">;
  groupAdditionalPrivilegeDAL: TGroupProjectUserAdditionalPrivilegeDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  accessApprovalPolicyApproverDAL: Pick<TAccessApprovalPolicyApproverDALFactory, "find">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "checkProjectUpgradeStatus" | "findProjectBySlug">;
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
    | "deleteById"
  >;
  accessApprovalPolicyDAL: Pick<TAccessApprovalPolicyDALFactory, "findOne" | "find">;
  accessApprovalRequestReviewerDAL: Pick<
    TAccessApprovalRequestReviewerDALFactory,
    "create" | "find" | "findOne" | "transaction"
  >;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findById">;
  smtpService: Pick<TSmtpService, "sendMail">;
  userDAL: Pick<
    TUserDALFactory,
    "findUserByProjectMembershipId" | "findUsersByProjectMembershipIds" | "findUsersByProjectId" | "findUserByProjectId"
  >;
};

export type TAccessApprovalRequestServiceFactory = ReturnType<typeof accessApprovalRequestServiceFactory>;

export const accessApprovalRequestServiceFactory = ({
  projectDAL,
  projectEnvDAL,
  permissionService,
  accessApprovalRequestDAL,
  groupAdditionalPrivilegeDAL,
  accessApprovalRequestReviewerDAL,
  projectMembershipDAL,
  accessApprovalPolicyDAL,
  accessApprovalPolicyApproverDAL,
  additionalPrivilegeDAL,
  smtpService,
  userDAL
}: TAccessApprovalRequestServiceFactoryDep) => {
  const createAccessApprovalRequest = async ({
    isTemporary,
    temporaryRange,
    actorId,
    permissions: requestedPermissions,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectSlug
  }: TCreateAccessApprovalRequestDTO) => {
    const cfg = getConfig();
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new UnauthorizedError({ message: "Project not found" });

    // Anyone can create an access approval request.
    const { membership } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );
    if (!membership) throw new UnauthorizedError({ message: "You are not a member of this project" });

    await projectDAL.checkProjectUpgradeStatus(project.id);

    const { envSlug, secretPath, accessTypes } = verifyRequestedPermissions({ permissions: requestedPermissions });
    const environment = await projectEnvDAL.findOne({ projectId: project.id, slug: envSlug });

    if (!environment) throw new UnauthorizedError({ message: "Environment not found" });

    const policy = await accessApprovalPolicyDAL.findOne({
      envId: environment.id,
      secretPath
    });
    if (!policy) throw new UnauthorizedError({ message: "No policy matching criteria was found." });

    const approvers = await accessApprovalPolicyApproverDAL.find({
      policyId: policy.id
    });

    if (approvers.some((approver) => !approver.approverUserId)) {
      throw new BadRequestError({ message: "Policy approvers must be assigned to users" });
    }

    const approverUsers = await userDAL.findUsersByProjectId(
      project.id,
      approvers.map((approver) => approver.approverUserId!)
    );

    const requestedByUser = await userDAL.findUserByProjectId(project.id, actorId);

    if (!requestedByUser) throw new BadRequestError({ message: "User not found in project" });

    const duplicateRequests = await accessApprovalRequestDAL.find({
      policyId: policy.id,
      requestedByUserId: actorId,
      permissions: JSON.stringify(requestedPermissions),
      isTemporary
    });

    if (duplicateRequests?.length > 0) {
      for await (const duplicateRequest of duplicateRequests) {
        let foundPrivilege: Pick<
          TProjectUserAdditionalPrivilege,
          "temporaryAccessEndTime" | "isTemporary" | "id"
        > | null = null;

        if (duplicateRequest.projectUserPrivilegeId) {
          foundPrivilege = await additionalPrivilegeDAL.findById(duplicateRequest.projectUserPrivilegeId);
        } else if (duplicateRequest.groupProjectUserPrivilegeId) {
          foundPrivilege = await groupAdditionalPrivilegeDAL.findById(duplicateRequest.groupProjectUserPrivilegeId);
        }

        if (foundPrivilege) {
          const isExpired = new Date() > new Date(foundPrivilege.temporaryAccessEndTime || ("" as string));

          if (!isExpired || !foundPrivilege.isTemporary) {
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
      const requesterUser = await userDAL.findUserByProjectId(project.id, actorId);

      if (!requesterUser?.projectMembershipId && !requesterUser?.groupProjectMembershipId) {
        throw new BadRequestError({ message: "You don't have a membership for this project" });
      }

      const approvalRequest = await accessApprovalRequestDAL.create(
        {
          projectMembershipId: requesterUser.projectMembershipId || null,
          groupMembershipId: requesterUser.groupProjectMembershipId || null,
          policyId: policy.id,
          requestedByUserId: actorId, // This is the user ID of the person who made the request
          temporaryRange: temporaryRange || null,
          permissions: JSON.stringify(requestedPermissions),
          isTemporary
        },
        tx
      );

      await smtpService.sendMail({
        recipients: approverUsers.filter((approver) => approver.email).map((approver) => approver.email!),
        subjectLine: "Access Approval Request",

        substitutions: {
          projectName: project.name,
          requesterFullName: `${requestedByUser.firstName} ${requestedByUser.lastName}`,
          requesterEmail: requestedByUser.email,
          isTemporary,
          ...(isTemporary && {
            expiresIn: ms(ms(temporaryRange || ""), { long: true })
          }),
          secretPath,
          environment: envSlug,
          permissions: accessTypes,
          approvalUrl: `${cfg.SITE_URL}/project/${project.id}/approval`
        },
        template: SmtpTemplates.AccessApprovalRequest
      });

      return approvalRequest;
    });

    return { request: approval };
  };

  const deleteAccessApprovalRequest = async ({
    projectSlug,
    actor,
    requestId,
    actorOrgId,
    actorId,
    actorAuthMethod
  }: TDeleteApprovalRequestDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new UnauthorizedError({ message: "Project not found" });

    const { membership, permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );
    if (!membership) throw new UnauthorizedError({ message: "You are not a member of this project" });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.SecretApproval
    );

    const accessApprovalRequest = await accessApprovalRequestDAL.findById(requestId);

    if (!accessApprovalRequest?.projectUserPrivilegeId && !accessApprovalRequest?.groupProjectUserPrivilegeId) {
      throw new BadRequestError({ message: "Access request must be approved to be deleted" });
    }

    if (accessApprovalRequest?.projectId !== project.id) {
      throw new UnauthorizedError({ message: "Request not found in project" });
    }

    const approvers = await accessApprovalPolicyApproverDAL.find({
      policyId: accessApprovalRequest.policyId
    });

    // make sure the actor (actorId) is an approver
    if (!approvers.some((approver) => approver.approverUserId === actorId)) {
      throw new UnauthorizedError({ message: "Only policy approvers can delete access requests" });
    }

    if (accessApprovalRequest.projectUserPrivilegeId) {
      await additionalPrivilegeDAL.deleteById(accessApprovalRequest.projectUserPrivilegeId);
    } else if (accessApprovalRequest.groupProjectUserPrivilegeId) {
      await groupAdditionalPrivilegeDAL.deleteById(accessApprovalRequest.groupProjectUserPrivilegeId);
    }

    return { request: accessApprovalRequest };
  };

  const listApprovalRequests = async ({
    projectSlug,
    authorUserId,
    envSlug,
    actor,
    actorOrgId,
    actorId,
    actorAuthMethod
  }: TListApprovalRequestsDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new UnauthorizedError({ message: "Project not found" });

    const { membership } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );
    if (!membership) throw new UnauthorizedError({ message: "You are not a member of this project" });

    const policies = await accessApprovalPolicyDAL.find({ projectId: project.id });
    let requests = await accessApprovalRequestDAL.findRequestsWithPrivilegeByPolicyIds(policies.map((p) => p.id));

    if (authorUserId) requests = requests.filter((request) => request.requestedByUserId === authorUserId);
    if (envSlug) requests = requests.filter((request) => request.environment === envSlug);

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
    if (!accessApprovalRequest) throw new BadRequestError({ message: "Secret approval request not found" });

    const { policy } = accessApprovalRequest;
    const { membership, hasRole } = await permissionService.getProjectPermission(
      actor,
      actorId,
      accessApprovalRequest.projectId,
      actorAuthMethod,
      actorOrgId
    );

    if (!membership) throw new UnauthorizedError({ message: "You are not a member of this project" });

    if (
      !hasRole(ProjectMembershipRole.Admin) &&
      accessApprovalRequest.requestedByUserId !== actorId && // The request wasn't made by the current user
      !policy.approvers.find((approverUserId) => approverUserId === membership.id) // The request isn't performed by an assigned approver
    ) {
      throw new UnauthorizedError({ message: "You are not authorized to approve this request" });
    }

    const reviewerProjectMembership = await projectMembershipDAL.findById(membership.id);

    await verifyApprovers({
      projectId: accessApprovalRequest.projectId,
      orgId: actorOrgId,
      envSlug: accessApprovalRequest.environment,
      secretPath: accessApprovalRequest.policy.secretPath!,
      actorAuthMethod,
      permissionService,
      userIds: [reviewerProjectMembership.userId]
    });

    const existingReviews = await accessApprovalRequestReviewerDAL.find({ requestId: accessApprovalRequest.id });
    if (existingReviews.some((review) => review.status === ApprovalStatus.REJECTED)) {
      throw new BadRequestError({ message: "The request has already been rejected by another reviewer" });
    }

    const reviewStatus = await accessApprovalRequestReviewerDAL.transaction(async (tx) => {
      const review = await accessApprovalRequestReviewerDAL.findOne(
        {
          requestId: accessApprovalRequest.id,
          memberUserId: actorId
        },
        tx
      );
      if (!review) {
        const newReview = await accessApprovalRequestReviewerDAL.create(
          {
            status,
            requestId: accessApprovalRequest.id,
            memberUserId: actorId
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

          let projectUserPrivilegeId: string | null = null;
          let groupProjectMembershipId: string | null = null;

          if (!accessApprovalRequest.groupMembershipId && !accessApprovalRequest.projectMembershipId) {
            throw new BadRequestError({ message: "Project membership or group membership is required" });
          }

          // Permanent access
          if (!accessApprovalRequest.isTemporary && !accessApprovalRequest.temporaryRange) {
            if (accessApprovalRequest.groupMembershipId) {
              // Group user privilege
              const groupProjectUserAdditionalPrivilege = await groupAdditionalPrivilegeDAL.create(
                {
                  groupProjectMembershipId: accessApprovalRequest.groupMembershipId,
                  requestedByUserId: accessApprovalRequest.requestedByUserId,
                  slug: `requested-privilege-${slugify(alphaNumericNanoId(12))}`,
                  permissions: JSON.stringify(accessApprovalRequest.permissions)
                },
                tx
              );

              groupProjectMembershipId = groupProjectUserAdditionalPrivilege.id;
            } else {
              // Project user privilege
              const privilege = await additionalPrivilegeDAL.create(
                {
                  projectMembershipId: accessApprovalRequest.projectMembershipId!,
                  slug: `requested-privilege-${slugify(alphaNumericNanoId(12))}`,
                  permissions: JSON.stringify(accessApprovalRequest.permissions)
                },
                tx
              );
              projectUserPrivilegeId = privilege.id;
            }
          } else {
            // Temporary access
            const relativeTempAllocatedTimeInMs = ms(accessApprovalRequest.temporaryRange!);
            const startTime = new Date();

            if (accessApprovalRequest.groupMembershipId) {
              //  Group user privilege
              const groupProjectUserAdditionalPrivilege = await groupAdditionalPrivilegeDAL.create(
                {
                  groupProjectMembershipId: accessApprovalRequest.groupMembershipId,
                  requestedByUserId: accessApprovalRequest.requestedByUserId,
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

              groupProjectMembershipId = groupProjectUserAdditionalPrivilege.id;
            } else {
              const privilege = await additionalPrivilegeDAL.create(
                {
                  projectMembershipId: accessApprovalRequest.projectMembershipId!,
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
              projectUserPrivilegeId = privilege.id;
            }
          }

          if (projectUserPrivilegeId) {
            await accessApprovalRequestDAL.updateById(accessApprovalRequest.id, { projectUserPrivilegeId }, tx);
          } else if (groupProjectMembershipId) {
            await accessApprovalRequestDAL.updateById(
              accessApprovalRequest.id,
              { groupProjectUserPrivilegeId: groupProjectMembershipId },
              tx
            );
          } else {
            throw new BadRequestError({ message: "No privilege was created" });
          }
        }

        return newReview;
      }
      throw new BadRequestError({ message: "You have already reviewed this request" });
    });

    return reviewStatus;
  };

  const getCount = async ({ projectSlug, actor, actorAuthMethod, actorId, actorOrgId }: TGetAccessRequestCountDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new UnauthorizedError({ message: "Project not found" });

    const { membership } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );
    if (!membership) throw new BadRequestError({ message: "User not found in project" });

    const count = await accessApprovalRequestDAL.getCount({ projectId: project.id });

    return { count };
  };

  return {
    createAccessApprovalRequest,
    listApprovalRequests,
    reviewAccessRequest,
    deleteAccessApprovalRequest,
    getCount
  };
};
