import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TGroupDALFactory } from "../group/group-dal";
import { TAccessApprovalPolicyApproverDALFactory } from "./access-approval-policy-approver-dal";
import { TAccessApprovalPolicyDALFactory } from "./access-approval-policy-dal";
import { isApproversValid } from "./access-approval-policy-fns";
import {
  ApproverType,
  TCreateAccessApprovalPolicy,
  TDeleteAccessApprovalPolicy,
  TGetAccessApprovalPolicyByIdDTO,
  TGetAccessPolicyCountByEnvironmentDTO,
  TListAccessApprovalPoliciesDTO,
  TUpdateAccessApprovalPolicy
} from "./access-approval-policy-types";

type TSecretApprovalPolicyServiceFactoryDep = {
  projectDAL: TProjectDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  accessApprovalPolicyDAL: TAccessApprovalPolicyDALFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "find" | "findOne">;
  accessApprovalPolicyApproverDAL: TAccessApprovalPolicyApproverDALFactory;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "find">;
  groupDAL: TGroupDALFactory;
  userDAL: Pick<TUserDALFactory, "find">;
};

export type TAccessApprovalPolicyServiceFactory = ReturnType<typeof accessApprovalPolicyServiceFactory>;

export const accessApprovalPolicyServiceFactory = ({
  accessApprovalPolicyDAL,
  accessApprovalPolicyApproverDAL,
  groupDAL,
  permissionService,
  projectEnvDAL,
  projectDAL,
  userDAL
}: TSecretApprovalPolicyServiceFactoryDep) => {
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
    enforcementLevel
  }: TCreateAccessApprovalPolicy) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: "Project not found" });

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

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretApproval
    );
    const env = await projectEnvDAL.findOne({ slug: environment, projectId: project.id });
    if (!env) throw new NotFoundError({ message: "Environment not found" });

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
      usersPromises.push(groupDAL.findAllGroupPossibleMembers({ orgId: actorOrgId, groupId, offset: 0 }));
    }
    const verifyGroupApprovers = (await Promise.all(usersPromises))
      .flat()
      .filter((user) => user.isPartOfGroup)
      .map((user) => user.id);
    verifyAllApprovers.push(...verifyGroupApprovers);

    const approversValid = await isApproversValid({
      projectId: project.id,
      orgId: actorOrgId,
      envSlug: environment,
      secretPath,
      actorAuthMethod,
      permissionService,
      userIds: verifyAllApprovers
    });

    if (!approversValid) {
      throw new BadRequestError({
        message: "One or more approvers doesn't have access to be specified secret path"
      });
    }

    const accessApproval = await accessApprovalPolicyDAL.transaction(async (tx) => {
      const doc = await accessApprovalPolicyDAL.create(
        {
          envId: env.id,
          approvals,
          secretPath,
          name,
          enforcementLevel
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
    if (!project) throw new NotFoundError({ message: "Project not found" });

    // Anyone in the project should be able to get the policies.
    /* const { permission } = */ await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );
    // ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);

    const accessApprovalPolicies = await accessApprovalPolicyDAL.find({ projectId: project.id });
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
    enforcementLevel
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

    if (!accessApprovalPolicy) throw new NotFoundError({ message: "Secret approval policy not found" });
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      accessApprovalPolicy.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretApproval);

    const updatedPolicy = await accessApprovalPolicyDAL.transaction(async (tx) => {
      const doc = await accessApprovalPolicyDAL.updateById(
        accessApprovalPolicy.id,
        {
          approvals,
          secretPath,
          name,
          enforcementLevel
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

        const approversValid = await isApproversValid({
          projectId: accessApprovalPolicy.projectId,
          orgId: actorOrgId,
          envSlug: accessApprovalPolicy.environment.slug,
          secretPath: doc.secretPath!,
          actorAuthMethod,
          permissionService,
          userIds: userApproverIds
        });

        if (!approversValid) {
          throw new BadRequestError({
            message: "One or more approvers doesn't have access to be specified secret path"
          });
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

        for (const groupId of groupApprovers) {
          usersPromises.push(groupDAL.findAllGroupPossibleMembers({ orgId: actorOrgId, groupId, offset: 0 }));
        }
        const verifyGroupApprovers = (await Promise.all(usersPromises))
          .flat()
          .filter((user) => user.isPartOfGroup)
          .map((user) => user.id);

        const approversValid = await isApproversValid({
          projectId: accessApprovalPolicy.projectId,
          orgId: actorOrgId,
          envSlug: accessApprovalPolicy.environment.slug,
          secretPath: doc.secretPath!,
          actorAuthMethod,
          permissionService,
          userIds: verifyGroupApprovers
        });

        if (!approversValid) {
          throw new BadRequestError({
            message: "One or more approvers doesn't have access to be specified secret path"
          });
        }

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
    if (!policy) throw new NotFoundError({ message: "Secret approval policy not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      policy.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.SecretApproval
    );

    await accessApprovalPolicyDAL.deleteById(policyId);
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

    if (!project) throw new NotFoundError({ message: "Project not found" });

    const { membership } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );
    if (!membership) {
      throw new ForbiddenRequestError({ message: "You are not a member of this project" });
    }

    const environment = await projectEnvDAL.findOne({ projectId: project.id, slug: envSlug });
    if (!environment) throw new NotFoundError({ message: "Environment not found" });

    const policies = await accessApprovalPolicyDAL.find({ envId: environment.id, projectId: project.id });
    if (!policies) throw new NotFoundError({ message: "No policies found" });

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
        message: "Cannot find access approval policy"
      });
    }

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      policy.projectId,
      actorAuthMethod,
      actorOrgId
    );

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
