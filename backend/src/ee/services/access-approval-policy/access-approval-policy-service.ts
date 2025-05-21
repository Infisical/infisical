import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionApprovalActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAccessApprovalRequestDALFactory } from "../access-approval-request/access-approval-request-dal";
import { TAccessApprovalRequestReviewerDALFactory } from "../access-approval-request/access-approval-request-reviewer-dal";
import { ApprovalStatus } from "../access-approval-request/access-approval-request-types";
import { TGroupDALFactory } from "../group/group-dal";
import { TProjectUserAdditionalPrivilegeDALFactory } from "../project-user-additional-privilege/project-user-additional-privilege-dal";
import { TAccessApprovalPolicyApproverDALFactory } from "./access-approval-policy-approver-dal";
import { TAccessApprovalPolicyDALFactory } from "./access-approval-policy-dal";
import {
  ApproverType,
  TCreateAccessApprovalPolicy,
  TDeleteAccessApprovalPolicy,
  TGetAccessApprovalPolicyByIdDTO,
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
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "find">;
  groupDAL: TGroupDALFactory;
  userDAL: Pick<TUserDALFactory, "find">;
  accessApprovalRequestDAL: Pick<TAccessApprovalRequestDALFactory, "update" | "find">;
  additionalPrivilegeDAL: Pick<TProjectUserAdditionalPrivilegeDALFactory, "delete">;
  accessApprovalRequestReviewerDAL: Pick<TAccessApprovalRequestReviewerDALFactory, "update">;
};

export type TAccessApprovalPolicyServiceFactory = ReturnType<typeof accessApprovalPolicyServiceFactory>;

export const accessApprovalPolicyServiceFactory = ({
  accessApprovalPolicyDAL,
  accessApprovalPolicyApproverDAL,
  groupDAL,
  permissionService,
  projectEnvDAL,
  projectDAL,
  userDAL,
  accessApprovalRequestDAL,
  additionalPrivilegeDAL,
  accessApprovalRequestReviewerDAL
}: TAccessApprovalPolicyServiceFactoryDep) => {
  const createAccessApprovalPolicy = async ({
    name,
    actor,
    actorId,
    actorOrgId,
    secretPath,
    actorAuthMethod,
    approvals,
    approvers,
    projectSlug,
    environment,
    enforcementLevel,
    allowedSelfApprovals
  }: TCreateAccessApprovalPolicy) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    // If there is a group approver people might be added to the group later to meet the approvers quota
    const groupApprovers = approvers
      .filter((approver) => approver.type === ApproverType.Group)
      .map((approver) => approver.id) as string[];

    const userApprovers = approvers
      .filter((approver) => approver.type === ApproverType.User)
      .map((approver) => approver.id)
      .filter(Boolean) as string[];

    const userApproverNames = approvers
      .map((approver) => (approver.type === ApproverType.User ? approver.name : undefined))
      .filter(Boolean) as string[];

    if (!groupApprovers && approvals > userApprovers.length + userApproverNames.length)
      throw new BadRequestError({ message: "Approvals cannot be greater than approvers" });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionApprovalActions.Create,
      ProjectPermissionSub.SecretApproval
    );
    const env = await projectEnvDAL.findOne({ slug: environment, projectId: project.id });
    if (!env) throw new NotFoundError({ message: `Environment with slug '${environment}' not found` });

    let approverUserIds = userApprovers;
    if (userApproverNames.length) {
      const approverUsers = await userDAL.find({
        $in: {
          username: userApproverNames
        }
      });

      const approverNamesFromDb = approverUsers.map((user) => user.username);
      const invalidUsernames = userApproverNames.filter((username) => !approverNamesFromDb.includes(username));

      if (invalidUsernames.length) {
        throw new BadRequestError({
          message: `Invalid approver user: ${invalidUsernames.join(", ")}`
        });
      }

      approverUserIds = approverUserIds.concat(approverUsers.map((user) => user.id));
    }

    const usersPromises: Promise<
      {
        id: string;
        email: string | null | undefined;
        username: string;
        firstName: string | null | undefined;
        lastName: string | null | undefined;
        isPartOfGroup: boolean;
      }[]
    >[] = [];
    const verifyAllApprovers = [...approverUserIds];

    for (const groupId of groupApprovers) {
      usersPromises.push(
        groupDAL.findAllGroupPossibleMembers({ orgId: actorOrgId, groupId, offset: 0 }).then((group) => group.members)
      );
    }
    const verifyGroupApprovers = (await Promise.all(usersPromises))
      .flat()
      .filter((user) => user.isPartOfGroup)
      .map((user) => user.id);
    verifyAllApprovers.push(...verifyGroupApprovers);

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
          approverUserIds.map((userId) => ({
            approverUserId: userId,
            policyId: doc.id
          })),
          tx
        );
      }

      if (groupApprovers) {
        await accessApprovalPolicyApproverDAL.insertMany(
          groupApprovers.map((groupId) => ({
            approverGroupId: groupId,
            policyId: doc.id
          })),
          tx
        );
      }

      return doc;
    });
    return { ...accessApproval, environment: env, projectId: project.id };
  };

  const getAccessApprovalPolicyByProjectSlug = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectSlug
  }: TListAccessApprovalPoliciesDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    // Anyone in the project should be able to get the policies.
    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const accessApprovalPolicies = await accessApprovalPolicyDAL.find({ projectId: project.id, deletedAt: null });
    return accessApprovalPolicies;
  };

  const updateAccessApprovalPolicy = async ({
    policyId,
    approvers,
    secretPath,
    name,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    approvals,
    enforcementLevel,
    allowedSelfApprovals
  }: TUpdateAccessApprovalPolicy) => {
    const groupApprovers = approvers
      .filter((approver) => approver.type === ApproverType.Group)
      .map((approver) => approver.id) as string[];

    const userApprovers = approvers
      .filter((approver) => approver.type === ApproverType.User)
      .map((approver) => approver.id)
      .filter(Boolean) as string[];

    const userApproverNames = approvers
      .map((approver) => (approver.type === ApproverType.User ? approver.name : undefined))
      .filter(Boolean) as string[];

    const accessApprovalPolicy = await accessApprovalPolicyDAL.findById(policyId);
    const currentAppovals = approvals || accessApprovalPolicy.approvals;
    if (
      groupApprovers?.length === 0 &&
      userApprovers &&
      currentAppovals > userApprovers.length + userApproverNames.length
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
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionApprovalActions.Edit,
      ProjectPermissionSub.SecretApproval
    );

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
        let userApproverIds = userApprovers;
        if (userApproverNames.length) {
          const approverUsers = await userDAL.find({
            $in: {
              username: userApproverNames
            }
          });

          const approverNamesFromDb = approverUsers.map((user) => user.username);
          const invalidUsernames = userApproverNames.filter((username) => !approverNamesFromDb.includes(username));

          if (invalidUsernames.length) {
            throw new BadRequestError({
              message: `Invalid approver user: ${invalidUsernames.join(", ")}`
            });
          }

          userApproverIds = userApproverIds.concat(approverUsers.map((user) => user.id));
        }

        await accessApprovalPolicyApproverDAL.insertMany(
          userApproverIds.map((userId) => ({
            approverUserId: userId,
            policyId: doc.id
          })),
          tx
        );
      }

      if (groupApprovers) {
        await accessApprovalPolicyApproverDAL.insertMany(
          groupApprovers.map((groupId) => ({
            approverGroupId: groupId,
            policyId: doc.id
          })),
          tx
        );
      }

      return doc;
    });
    return {
      ...updatedPolicy,
      environment: accessApprovalPolicy.environment,
      projectId: accessApprovalPolicy.projectId
    };
  };

  const deleteAccessApprovalPolicy = async ({
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
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionApprovalActions.Delete,
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

  const getAccessPolicyCountByEnvSlug = async ({
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
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
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

  const getAccessApprovalPolicyById = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    policyId
  }: TGetAccessApprovalPolicyByIdDTO) => {
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
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionApprovalActions.Read,
      ProjectPermissionSub.SecretApproval
    );

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
