import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";
import ms from "ms";

import { ProjectMembershipRole } from "@app/db/schemas";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";

import { TAccessApprovalPolicyDALFactory } from "../access-approval-policy/access-approval-policy-dal";
import { verifyApprovers } from "../access-approval-policy/access-approval-policy-fns";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TProjectUserAdditionalPrivilegeDALFactory } from "../project-user-additional-privilege/project-user-additional-privilege-dal";
import { TProjectUserAdditionalPrivilegeServiceFactory } from "../project-user-additional-privilege/project-user-additional-privilege-service";
import { ProjectUserAdditionalPrivilegeTemporaryMode } from "../project-user-additional-privilege/project-user-additional-privilege-types";
import { TAccessApprovalRequestDALFactory } from "./access-approval-request-dal";
import { TAccessApprovalRequestReviewerDALFactory } from "./access-approval-request-reviewer-dal";
import {
  ApprovalStatus,
  TCreateAccessApprovalRequestDTO,
  TGetAccessRequestCountDTO,
  TListApprovalRequestsDTO,
  TReviewAccessRequestDTO
} from "./access-approval-request-types";

type TSecretApprovalRequestServiceFactoryDep = {
  additionalPrivilegeService: TProjectUserAdditionalPrivilegeServiceFactory;
  additionalPrivilegeDAL: TProjectUserAdditionalPrivilegeDALFactory;
  permissionService: TPermissionServiceFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "checkProjectUpgradeStatus" | "findProjectBySlug">;
  accessApprovalRequestDAL: TAccessApprovalRequestDALFactory;
  accessApprovalPolicyDAL: TAccessApprovalPolicyDALFactory;
  accessApprovalRequestReviewerDAL: TAccessApprovalRequestReviewerDALFactory;
  projectMembershipDAL: TProjectMembershipDALFactory;
};

export type TAccessApprovalRequestServiceFactory = ReturnType<typeof accessApprovalRequestServiceFactory>;

export const accessApprovalRequestServiceFactory = ({
  projectDAL,
  projectEnvDAL,
  permissionService,
  accessApprovalRequestDAL,
  accessApprovalRequestReviewerDAL,
  projectMembershipDAL,
  accessApprovalPolicyDAL,
  additionalPrivilegeDAL
}: TSecretApprovalRequestServiceFactoryDep) => {
  const createAccessApprovalRequest = async ({
    isTemporary,
    temporaryRange,
    actorId,
    envSlug,
    permissions,
    secretPath,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectSlug
  }: TCreateAccessApprovalRequestDTO) => {
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

    const environment = await projectEnvDAL.findOne({ projectId: project.id, slug: envSlug });

    if (!environment) throw new UnauthorizedError({ message: "Environment not found" });
    if (!secretPath) throw new UnauthorizedError({ message: "Secret path is required" });

    const policy = await accessApprovalPolicyDAL.findOne({
      envId: environment.id,
      secretPath
    });
    if (!policy) throw new UnauthorizedError({ message: "No policy matching criteria was found." });

    const duplicateRequest = await accessApprovalRequestDAL.findOne({
      policyId: policy.id,
      requestedBy: membership.id,
      permissions: JSON.stringify(permissions),
      temporaryRange: temporaryRange || null,
      isTemporary
    });

    if (duplicateRequest.privilegeId) {
      const privilege = await additionalPrivilegeDAL.findById(duplicateRequest.privilegeId);

      const isExpired = new Date() > new Date(privilege.temporaryAccessEndTime || ("" as string));

      if (!isExpired) {
        throw new BadRequestError({ message: "You have already requested access with the same permissions" });
      }
    }

    const approvalRequest = await accessApprovalRequestDAL.create({
      policyId: policy.id,
      requestedBy: membership.id,
      temporaryRange: temporaryRange || null,
      permissions: JSON.stringify(permissions),
      isTemporary
    });

    return { request: approvalRequest };
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
    if (!project) throw new UnauthorizedError({ message: "Project not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);

    const policies = await accessApprovalPolicyDAL.find({ projectId: project.id });
    let requests = await accessApprovalRequestDAL.findRequestsWithPrivilegeByPolicyIds(policies.map((p) => p.id));

    if (authorProjectMembershipId) {
      requests = requests.filter((request) => request.requestedBy === authorProjectMembershipId);
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
      accessApprovalRequest.requestedBy !== membership.id && // The request wasn't made by the current user
      !policy.approvers.find((approverId) => approverId === membership.id) // The request isn't performed by an assigned approver
    ) {
      throw new UnauthorizedError({ message: "No access" });
    }

    const reviewerProjectMembership = await projectMembershipDAL.findById(membership.id);

    await verifyApprovers({
      projectId: accessApprovalRequest.projectId,
      orgId: actorOrgId,
      envSlug: accessApprovalRequest.environment,
      secretPath: accessApprovalRequest.policy.secretPath!,
      actorAuthMethod,
      permissionService,
      approverProjectMemberships: [reviewerProjectMembership]
    });

    const existingReviews = await accessApprovalRequestReviewerDAL.find({ requestId: accessApprovalRequest.id });
    if (existingReviews.some((review) => review.status === ApprovalStatus.REJECTED)) {
      throw new BadRequestError({ message: "The request has already been rejected by another reviewer" });
    }

    const reviewStatus = await accessApprovalRequestReviewerDAL.transaction(async (tx) => {
      const review = await accessApprovalRequestReviewerDAL.findOne(
        {
          requestId: accessApprovalRequest.id,
          member: membership.id
        },
        tx
      );
      if (!review) {
        const newReview = await accessApprovalRequestReviewerDAL.create(
          {
            status,
            requestId: accessApprovalRequest.id,
            member: membership.id
          },
          tx
        );

        const allReviews = [...existingReviews, newReview];

        const approvedReviews = allReviews.filter((r) => r.status === ApprovalStatus.APPROVED);

        // If all approvers have approved the request, update the privilege to approved
        if (approvedReviews.length === policy.approvers.length) {
          if (accessApprovalRequest.isTemporary && !accessApprovalRequest.temporaryRange) {
            throw new BadRequestError({ message: "Temporary range is required for temporary access" });
          }

          let privilegeId: string | null = null;

          if (!accessApprovalRequest.isTemporary && !accessApprovalRequest.temporaryRange) {
            // Permanent access
            const privilege = await additionalPrivilegeDAL.create({
              projectMembershipId: accessApprovalRequest.requestedBy,
              slug: `requested-privilege-${slugify(alphaNumericNanoId(12))}`,
              permissions: JSON.stringify(accessApprovalRequest.permissions)
            });
            privilegeId = privilege.id;
          } else {
            // Temporary access
            const relativeTempAllocatedTimeInMs = ms(accessApprovalRequest.temporaryRange!);
            const startTime = new Date();

            const privilege = await additionalPrivilegeDAL.create({
              projectMembershipId: accessApprovalRequest.requestedBy,
              slug: `requested-privilege-${slugify(alphaNumericNanoId(12))}`,
              permissions: JSON.stringify(accessApprovalRequest.permissions),
              isTemporary: true,
              temporaryMode: ProjectUserAdditionalPrivilegeTemporaryMode.Relative,
              temporaryRange: accessApprovalRequest.temporaryRange!,
              temporaryAccessStartTime: startTime,
              temporaryAccessEndTime: new Date(new Date(startTime).getTime() + relativeTempAllocatedTimeInMs)
            });
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
    if (!project) throw new UnauthorizedError({ message: "Project not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);

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
