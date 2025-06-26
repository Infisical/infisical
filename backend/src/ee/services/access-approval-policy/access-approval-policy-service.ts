import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAccessApprovalRequestDALFactory } from "../access-approval-request/access-approval-request-dal";
import { TAccessApprovalRequestReviewerDALFactory } from "../access-approval-request/access-approval-request-reviewer-dal";
import { ApprovalStatus } from "../access-approval-request/access-approval-request-types";
import { TGroupDALFactory } from "../group/group-dal";
import { TProjectUserAdditionalPrivilegeDALFactory } from "../project-user-additional-privilege/project-user-additional-privilege-dal";
import {
  TAccessApprovalPolicyApproverDALFactory,
  TAccessApprovalPolicyBypasserDALFactory
} from "./access-approval-policy-approver-dal";
import { TAccessApprovalPolicyDALFactory } from "./access-approval-policy-dal";
import {
  ApproverType,
  BypasserType,
  TAccessApprovalPolicyServiceFactory,
  TDeleteAccessApprovalPolicy,
  TGetAccessPolicyCountByEnvironmentDTO,
  TListAccessApprovalPoliciesDTO,
  TUpdateAccessApprovalPolicy
} from "./access-approval-policy-types";

type TAccessApprovalPolicyServiceFactoryDep = {
  projectDAL: TProjectDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  accessApprovalPolicyDAL: TAccessApprovalPolicyDALFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find" | "findOne">;
  accessApprovalPolicyApproverDAL: TAccessApprovalPolicyApproverDALFactory;
  accessApprovalPolicyBypasserDAL: TAccessApprovalPolicyBypasserDALFactory;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "find">;
  groupDAL: TGroupDALFactory;
  userDAL: Pick<TUserDALFactory, "find">;
  accessApprovalRequestDAL: Pick<TAccessApprovalRequestDALFactory, "update" | "find" | "resetReviewByPolicyId">;
  additionalPrivilegeDAL: Pick<TProjectUserAdditionalPrivilegeDALFactory, "delete">;
  accessApprovalRequestReviewerDAL: Pick<TAccessApprovalRequestReviewerDALFactory, "update" | "delete">;
  orgMembershipDAL: Pick<TOrgMembershipDALFactory, "find">;
};

export const accessApprovalPolicyServiceFactory = ({
  accessApprovalPolicyDAL,
  accessApprovalPolicyApproverDAL,
  accessApprovalPolicyBypasserDAL,
  groupDAL,
  permissionService,
  projectEnvDAL,
  projectDAL,
  userDAL,
  accessApprovalRequestDAL,
  additionalPrivilegeDAL,
  accessApprovalRequestReviewerDAL,
  orgMembershipDAL
}: TAccessApprovalPolicyServiceFactoryDep): TAccessApprovalPolicyServiceFactory => {
  const createAccessApprovalPolicy: TAccessApprovalPolicyServiceFactory["createAccessApprovalPolicy"] = async ({
    name,
    actor,
    actorId,
    actorOrgId,
    secretPath,
    actorAuthMethod,
    approvals,
    approvers,
    bypassers,
    projectSlug,
    environment,
    enforcementLevel,
    allowedSelfApprovals,
    approvalsRequired
  }) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    // If there is a group approver people might be added to the group later to meet the approvers quota
    const groupApprovers = approvers.filter((approver) => approver.type === ApproverType.Group);

    const userApprovers = approvers.filter((approver) => approver.type === ApproverType.User && approver.id) as {
      id: string;
      sequence?: number;
    }[];

    const userApproverNames = approvers.filter(
      (approver) => approver.type === ApproverType.User && approver.username
    ) as { username: string; sequence?: number }[];

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretApproval
    );
    const env = await projectEnvDAL.findOne({ slug: environment, projectId: project.id });
    if (!env) throw new NotFoundError({ message: `Environment with slug '${environment}' not found` });

    let approverUserIds = userApprovers;
    if (userApproverNames.length) {
      const approverUsersInDB = await userDAL.find({
        $in: {
          username: userApproverNames.map((el) => el.username)
        }
      });
      const approverUsersInDBGroupByUsername = groupBy(approverUsersInDB, (i) => i.username);
      const invalidUsernames = userApproverNames.filter((el) => !approverUsersInDBGroupByUsername?.[el.username]?.[0]);

      if (invalidUsernames.length) {
        throw new BadRequestError({
          message: `Invalid approver user: ${invalidUsernames.join(", ")}`
        });
      }

      approverUserIds = approverUserIds.concat(
        userApproverNames.map((el) => ({
          id: approverUsersInDBGroupByUsername[el.username]?.[0].id,
          sequence: el.sequence
        }))
      );
    }
    let groupBypassers: string[] = [];
    let bypasserUserIds: string[] = [];

    if (bypassers && bypassers.length) {
      groupBypassers = bypassers
        .filter((bypasser) => bypasser.type === BypasserType.Group)
        .map((bypasser) => bypasser.id) as string[];

      const userBypassers = bypassers
        .filter((bypasser) => bypasser.type === BypasserType.User)
        .map((bypasser) => bypasser.id)
        .filter(Boolean) as string[];

      const userBypasserNames = bypassers
        .map((bypasser) => (bypasser.type === BypasserType.User ? bypasser.username : undefined))
        .filter(Boolean) as string[];

      bypasserUserIds = userBypassers;
      if (userBypasserNames.length) {
        const bypasserUsers = await userDAL.find({
          $in: {
            username: userBypasserNames
          }
        });

        const bypasserNamesFromDb = bypasserUsers.map((user) => user.username);
        const invalidUsernames = userBypasserNames.filter((username) => !bypasserNamesFromDb.includes(username));

        if (invalidUsernames.length) {
          throw new BadRequestError({
            message: `Invalid bypasser user: ${invalidUsernames.join(", ")}`
          });
        }

        bypasserUserIds = bypasserUserIds.concat(bypasserUsers.map((user) => user.id));
      }
    }

    const approvalsRequiredGroupByStepNumber = groupBy(approvalsRequired || [], (i) => i.stepNumber);
    const accessApproval = await accessApprovalPolicyDAL.transaction(async (tx) => {
      const doc = await accessApprovalPolicyDAL.create(
        {
          envId: env.id,
          approvals,
          secretPath,
          name,
          enforcementLevel,
          allowedSelfApprovals
        },
        tx
      );

      if (approverUserIds.length) {
        await accessApprovalPolicyApproverDAL.insertMany(
          approverUserIds.map((el) => ({
            approverUserId: el.id,
            policyId: doc.id,
            sequence: el.sequence,
            approvalsRequired: el.sequence
              ? approvalsRequiredGroupByStepNumber?.[el.sequence]?.[0]?.numberOfApprovals
              : approvals
          })),
          tx
        );
      }

      if (groupApprovers) {
        await accessApprovalPolicyApproverDAL.insertMany(
          groupApprovers.map((el) => ({
            approverGroupId: el.id,
            policyId: doc.id,
            sequence: el.sequence,
            approvalsRequired: el.sequence
              ? approvalsRequiredGroupByStepNumber?.[el.sequence]?.[0]?.numberOfApprovals
              : approvals
          })),
          tx
        );
      }

      if (bypasserUserIds.length) {
        await accessApprovalPolicyBypasserDAL.insertMany(
          bypasserUserIds.map((userId) => ({
            bypasserUserId: userId,
            policyId: doc.id
          })),
          tx
        );
      }

      if (groupBypassers.length) {
        await accessApprovalPolicyBypasserDAL.insertMany(
          groupBypassers.map((groupId) => ({
            bypasserGroupId: groupId,
            policyId: doc.id
          })),
          tx
        );
      }

      return doc;
    });

    return { ...accessApproval, environment: env, projectId: project.id };
  };

  const getAccessApprovalPolicyByProjectSlug: TAccessApprovalPolicyServiceFactory["getAccessApprovalPolicyByProjectSlug"] =
    async ({ actorId, actor, actorOrgId, actorAuthMethod, projectSlug }: TListAccessApprovalPoliciesDTO) => {
      const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
      if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

      // Anyone in the project should be able to get the policies.
      await permissionService.getProjectPermission({
        actor,
        actorId,
        projectId: project.id,
        actorAuthMethod,
        actorOrgId
      });

      const accessApprovalPolicies = await accessApprovalPolicyDAL.find({ projectId: project.id, deletedAt: null });
      return accessApprovalPolicies;
    };

  const updateAccessApprovalPolicy: TAccessApprovalPolicyServiceFactory["updateAccessApprovalPolicy"] = async ({
    policyId,
    approvers,
    bypassers,
    secretPath,
    name,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    approvals,
    enforcementLevel,
    allowedSelfApprovals,
    approvalsRequired
  }: TUpdateAccessApprovalPolicy) => {
    const groupApprovers = approvers.filter((approver) => approver.type === ApproverType.Group);

    const userApprovers = approvers.filter((approver) => approver.type === ApproverType.User && approver.id) as {
      id: string;
      sequence?: number;
    }[];
    const userApproverNames = approvers.filter(
      (approver) => approver.type === ApproverType.User && approver.username
    ) as { username: string; sequence?: number }[];

    const accessApprovalPolicy = await accessApprovalPolicyDAL.findById(policyId);
    if (!accessApprovalPolicy) throw new BadRequestError({ message: "Approval policy not found" });

    const currentApprovals = approvals || accessApprovalPolicy.approvals;
    if (
      groupApprovers?.length === 0 &&
      userApprovers &&
      currentApprovals > userApprovers.length + userApproverNames.length
    ) {
      throw new BadRequestError({ message: "Approvals cannot be greater than approvers" });
    }

    if (!accessApprovalPolicy) {
      throw new NotFoundError({ message: `Secret approval policy with ID '${policyId}' not found` });
    }
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: accessApprovalPolicy.projectId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretApproval);

    let groupBypassers: string[] = [];
    let bypasserUserIds: string[] = [];

    if (bypassers && bypassers.length) {
      groupBypassers = bypassers
        .filter((bypasser) => bypasser.type === BypasserType.Group)
        .map((bypasser) => bypasser.id) as string[];

      groupBypassers = [...new Set(groupBypassers)];

      const userBypassers = bypassers
        .filter((bypasser) => bypasser.type === BypasserType.User)
        .map((bypasser) => bypasser.id)
        .filter(Boolean) as string[];

      const userBypasserNames = bypassers
        .map((bypasser) => (bypasser.type === BypasserType.User ? bypasser.username : undefined))
        .filter(Boolean) as string[];

      bypasserUserIds = userBypassers;
      if (userBypasserNames.length) {
        const bypasserUsers = await userDAL.find({
          $in: {
            username: userBypasserNames
          }
        });

        const bypasserNamesFromDb = bypasserUsers.map((user) => user.username);
        const invalidUsernames = userBypasserNames.filter((username) => !bypasserNamesFromDb.includes(username));

        if (invalidUsernames.length) {
          throw new BadRequestError({
            message: `Invalid bypasser user: ${invalidUsernames.join(", ")}`
          });
        }

        bypasserUserIds = [...new Set(bypasserUserIds.concat(bypasserUsers.map((user) => user.id)))];
      }

      // Validate user bypassers
      if (bypasserUserIds.length > 0) {
        const orgMemberships = await orgMembershipDAL.find({
          $in: { userId: bypasserUserIds },
          orgId: actorOrgId
        });

        if (orgMemberships.length !== bypasserUserIds.length) {
          const foundUserIdsInOrg = new Set(orgMemberships.map((mem) => mem.userId));
          const missingUserIds = bypasserUserIds.filter((id) => !foundUserIdsInOrg.has(id));
          throw new BadRequestError({
            message: `One or more specified bypasser users are not part of the organization or do not exist. Invalid or non-member user IDs: ${missingUserIds.join(", ")}`
          });
        }
      }

      // Validate group bypassers
      if (groupBypassers.length > 0) {
        const orgGroups = await groupDAL.find({
          $in: { id: groupBypassers },
          orgId: actorOrgId
        });

        if (orgGroups.length !== groupBypassers.length) {
          const foundGroupIdsInOrg = new Set(orgGroups.map((group) => group.id));
          const missingGroupIds = groupBypassers.filter((id) => !foundGroupIdsInOrg.has(id));
          throw new BadRequestError({
            message: `One or more specified bypasser groups are not part of the organization or do not exist. Invalid or non-member group IDs: ${missingGroupIds.join(", ")}`
          });
        }
      }
    }

    const approvalsRequiredGroupByStepNumber = groupBy(approvalsRequired || [], (i) => i.stepNumber);
    const updatedPolicy = await accessApprovalPolicyDAL.transaction(async (tx) => {
      const doc = await accessApprovalPolicyDAL.updateById(
        accessApprovalPolicy.id,
        {
          approvals,
          secretPath,
          name,
          enforcementLevel,
          allowedSelfApprovals
        },
        tx
      );

      await accessApprovalPolicyApproverDAL.delete({ policyId: doc.id }, tx);

      if (userApprovers.length || userApproverNames.length) {
        let approverUserIds = userApprovers;
        if (userApproverNames.length) {
          const approverUsersInDB = await userDAL.find({
            $in: {
              username: userApproverNames.map((el) => el.username)
            }
          });
          const approverUsersInDBGroupByUsername = groupBy(approverUsersInDB, (i) => i.username);

          const invalidUsernames = userApproverNames.filter(
            (el) => !approverUsersInDBGroupByUsername?.[el.username]?.[0]
          );

          if (invalidUsernames.length) {
            throw new BadRequestError({
              message: `Invalid approver user: ${invalidUsernames.join(", ")}`
            });
          }

          approverUserIds = approverUserIds.concat(
            userApproverNames.map((el) => ({
              id: approverUsersInDBGroupByUsername[el.username]?.[0].id,
              sequence: el.sequence
            }))
          );
        }
        await accessApprovalPolicyApproverDAL.insertMany(
          approverUserIds.map((el) => ({
            approverUserId: el.id,
            policyId: doc.id,
            sequence: el.sequence,
            approvalsRequired: el.sequence
              ? approvalsRequiredGroupByStepNumber?.[el.sequence]?.[0]?.numberOfApprovals
              : approvals
          })),
          tx
        );
      }

      if (groupApprovers) {
        await accessApprovalPolicyApproverDAL.insertMany(
          groupApprovers.map((el) => ({
            approverGroupId: el.id,
            policyId: doc.id,
            sequence: el.sequence,
            approvalsRequired: el.sequence
              ? approvalsRequiredGroupByStepNumber?.[el.sequence]?.[0]?.numberOfApprovals
              : approvals
          })),
          tx
        );
      }

      await accessApprovalPolicyBypasserDAL.delete({ policyId: doc.id }, tx);

      if (bypasserUserIds.length) {
        await accessApprovalPolicyBypasserDAL.insertMany(
          bypasserUserIds.map((userId) => ({
            bypasserUserId: userId,
            policyId: doc.id
          })),
          tx
        );
      }

      if (groupBypassers.length) {
        await accessApprovalPolicyBypasserDAL.insertMany(
          groupBypassers.map((groupId) => ({
            bypasserGroupId: groupId,
            policyId: doc.id
          })),
          tx
        );
      }

      await accessApprovalRequestDAL.resetReviewByPolicyId(doc.id, tx);

      return doc;
    });

    return {
      ...updatedPolicy,
      environment: accessApprovalPolicy.environment,
      projectId: accessApprovalPolicy.projectId
    };
  };

  const deleteAccessApprovalPolicy: TAccessApprovalPolicyServiceFactory["deleteAccessApprovalPolicy"] = async ({
    policyId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteAccessApprovalPolicy) => {
    const policy = await accessApprovalPolicyDAL.findById(policyId);
    if (!policy) throw new NotFoundError({ message: `Secret approval policy with ID '${policyId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: policy.projectId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.SecretApproval
    );

    await accessApprovalPolicyDAL.transaction(async (tx) => {
      await accessApprovalPolicyDAL.softDeleteById(policyId, tx);
      const allAccessApprovalRequests = await accessApprovalRequestDAL.find({ policyId });

      if (allAccessApprovalRequests.length) {
        const accessApprovalRequestsIds = allAccessApprovalRequests.map((request) => request.id);

        const privilegeIdsArray = allAccessApprovalRequests
          .map((request) => request.privilegeId)
          .filter((id): id is string => id != null);

        if (privilegeIdsArray.length) {
          await additionalPrivilegeDAL.delete({ $in: { id: privilegeIdsArray } }, tx);
        }

        await accessApprovalRequestReviewerDAL.update(
          { $in: { id: accessApprovalRequestsIds }, status: ApprovalStatus.PENDING },
          { status: ApprovalStatus.REJECTED },
          tx
        );
      }
    });

    return policy;
  };

  const getAccessPolicyCountByEnvSlug: TAccessApprovalPolicyServiceFactory["getAccessPolicyCountByEnvSlug"] = async ({
    actor,
    actorOrgId,
    actorAuthMethod,
    projectSlug,
    actorId,
    envSlug
  }: TGetAccessPolicyCountByEnvironmentDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);

    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const { membership } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId
    });
    if (!membership) {
      throw new ForbiddenRequestError({ message: "You are not a member of this project" });
    }

    const environment = await projectEnvDAL.findOne({ projectId: project.id, slug: envSlug });
    if (!environment) throw new NotFoundError({ message: `Environment with slug '${envSlug}' not found` });

    const policies = await accessApprovalPolicyDAL.find({
      envId: environment.id,
      projectId: project.id,
      deletedAt: null
    });
    if (!policies) throw new NotFoundError({ message: `No policies found in environment with slug '${envSlug}'` });

    return { count: policies.length };
  };

  const getAccessApprovalPolicyById: TAccessApprovalPolicyServiceFactory["getAccessApprovalPolicyById"] = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    policyId
  }) => {
    const [policy] = await accessApprovalPolicyDAL.find({}, { policyId });

    if (!policy) {
      throw new NotFoundError({
        message: `Cannot find access approval policy with ID ${policyId}`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: policy.projectId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);

    return policy;
  };

  return {
    getAccessPolicyCountByEnvSlug,
    createAccessApprovalPolicy,
    deleteAccessApprovalPolicy,
    updateAccessApprovalPolicy,
    getAccessApprovalPolicyByProjectSlug,
    getAccessApprovalPolicyById
  };
};
