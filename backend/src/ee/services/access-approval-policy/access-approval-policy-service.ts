import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas/models";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAccessApprovalRequestDALFactory } from "../access-approval-request/access-approval-request-dal";
import { TAccessApprovalRequestReviewerDALFactory } from "../access-approval-request/access-approval-request-reviewer-dal";
import { ApprovalStatus } from "../access-approval-request/access-approval-request-types";
import { TGroupDALFactory } from "../group/group-dal";
import {
  TAccessApprovalPolicyApproverDALFactory,
  TAccessApprovalPolicyBypasserDALFactory
} from "./access-approval-policy-approver-dal";
import { TAccessApprovalPolicyDALFactory } from "./access-approval-policy-dal";
import { TAccessApprovalPolicyEnvironmentDALFactory } from "./access-approval-policy-environment-dal";
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
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "findProjectMembershipsByUserIds">;
  groupDAL: TGroupDALFactory;
  userDAL: Pick<TUserDALFactory, "find">;
  accessApprovalRequestDAL: Pick<TAccessApprovalRequestDALFactory, "update" | "find" | "resetReviewByPolicyId">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "delete">;
  accessApprovalRequestReviewerDAL: Pick<TAccessApprovalRequestReviewerDALFactory, "update" | "delete">;
  accessApprovalPolicyEnvironmentDAL: TAccessApprovalPolicyEnvironmentDALFactory;
};

export const accessApprovalPolicyServiceFactory = ({
  accessApprovalPolicyDAL,
  accessApprovalPolicyApproverDAL,
  accessApprovalPolicyBypasserDAL,
  accessApprovalPolicyEnvironmentDAL,
  groupDAL,
  permissionService,
  projectEnvDAL,
  projectDAL,
  userDAL,
  accessApprovalRequestDAL,
  additionalPrivilegeDAL,
  accessApprovalRequestReviewerDAL,
  projectMembershipDAL
}: TAccessApprovalPolicyServiceFactoryDep): TAccessApprovalPolicyServiceFactory => {
  const $policyExists = async ({
    envId,
    envIds,
    secretPath,
    policyId
  }: {
    envId?: string;
    envIds?: string[];
    secretPath: string;
    policyId?: string;
  }) => {
    if (!envId && !envIds) {
      throw new BadRequestError({ message: "Must provide either envId or envIds" });
    }
    const policy = await accessApprovalPolicyDAL.findPolicyByEnvIdAndSecretPath({
      secretPath,
      envIds: envId ? [envId] : (envIds as string[])
    });
    return policyId ? policy && policy.id !== policyId : Boolean(policy);
  };

  const verifyProjectUserMembership = async (userIds: string[], orgId: string, projectId: string) => {
    if (userIds.length === 0) return;
    const projectMemberships = (await projectMembershipDAL.findProjectMembershipsByUserIds(orgId, userIds)).filter(
      (v) => v.projectId === projectId
    );

    if (projectMemberships.length !== userIds.length) {
      const projectMemberUserIds = new Set(projectMemberships.map((member) => member.userId));
      const userIdsNotInProject = userIds.filter((id) => !projectMemberUserIds.has(id));
      throw new BadRequestError({
        message: `Some users are not members of the project: ${userIdsNotInProject.join(", ")}`
      });
    }
  };

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
    environments,
    enforcementLevel,
    allowedSelfApprovals,
    approvalsRequired,
    maxTimePeriod
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
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretApproval
    );
    const mergedEnvs = (environment ? [environment] : environments) || [];
    if (mergedEnvs.length === 0) {
      throw new BadRequestError({ message: "Must provide either environment or environments" });
    }
    const envs = await projectEnvDAL.find({ $in: { slug: mergedEnvs }, projectId: project.id });
    if (!envs.length || envs.length !== mergedEnvs.length) {
      const notFoundEnvs = mergedEnvs.filter((env) => !envs.find((el) => el.slug === env));
      throw new NotFoundError({ message: `One or more environments not found: ${notFoundEnvs.join(", ")}` });
    }

    for (const env of envs) {
      // eslint-disable-next-line no-await-in-loop
      if (await $policyExists({ envId: env.id, secretPath })) {
        throw new BadRequestError({
          message: `A policy for secret path '${secretPath}' already exists in environment '${env.slug}'`
        });
      }
    }

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
          message: `Invalid approver user: ${invalidUsernames.map((i) => i.username).join(", ")}`
        });
      }

      approverUserIds = approverUserIds.concat(
        userApproverNames.map((el) => ({
          id: approverUsersInDBGroupByUsername[el.username]?.[0].id,
          sequence: el.sequence
        }))
      );
    }

    if (approverUserIds.length > 0) {
      await verifyProjectUserMembership(
        approverUserIds.map((au) => au.id),
        project.orgId,
        project.id
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
          envId: envs[0].id,
          approvals,
          secretPath,
          name,
          enforcementLevel,
          allowedSelfApprovals,
          maxTimePeriod
        },
        tx
      );
      await accessApprovalPolicyEnvironmentDAL.insertMany(
        envs.map((el) => ({ policyId: doc.id, envId: el.id })),
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
        await verifyProjectUserMembership(bypasserUserIds, project.orgId, project.id);

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

    return { ...accessApproval, environments: envs, projectId: project.id, environment: envs[0] };
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
        actorOrgId,
        actionProjectType: ActionProjectType.SecretManager
      });

      const accessApprovalPolicies = await accessApprovalPolicyDAL.find({ projectId: project.id, deletedAt: null });
      return accessApprovalPolicies.map((policy) => ({
        ...policy,
        environment: policy.environments[0]
      }));
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
    approvalsRequired,
    environments,
    maxTimePeriod
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
    if (!accessApprovalPolicy) {
      throw new NotFoundError({
        message: `Access approval policy with ID '${policyId}' not found`
      });
    }

    const currentApprovals = approvals || accessApprovalPolicy.approvals;
    if (
      groupApprovers?.length === 0 &&
      userApprovers &&
      currentApprovals > userApprovers.length + userApproverNames.length
    ) {
      throw new BadRequestError({ message: "Approvals cannot be greater than approvers" });
    }

    let envs = accessApprovalPolicy.environments;
    if (
      environments &&
      (environments.length !== envs.length || environments.some((env) => !envs.find((el) => el.slug === env)))
    ) {
      envs = await projectEnvDAL.find({ $in: { slug: environments }, projectId: accessApprovalPolicy.projectId });
    }

    for (const env of envs) {
      if (
        // eslint-disable-next-line no-await-in-loop
        await $policyExists({
          envId: env.id,
          secretPath: secretPath || accessApprovalPolicy.secretPath,
          policyId: accessApprovalPolicy.id
        })
      ) {
        throw new BadRequestError({
          message: `A policy for secret path '${secretPath || accessApprovalPolicy.secretPath}' already exists in environment '${env.slug}'`
        });
      }
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: accessApprovalPolicy.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
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
          allowedSelfApprovals,
          maxTimePeriod
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
              message: `Invalid approver user: ${invalidUsernames.map((i) => i.username).join(", ")}`
            });
          }

          approverUserIds = approverUserIds.concat(
            userApproverNames.map((el) => ({
              id: approverUsersInDBGroupByUsername[el.username]?.[0].id,
              sequence: el.sequence
            }))
          );
        }

        if (approverUserIds.length > 0) {
          await verifyProjectUserMembership(
            approverUserIds.map((au) => au.id),
            actorOrgId,
            accessApprovalPolicy.projectId
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

      if (environments) {
        await accessApprovalPolicyEnvironmentDAL.delete({ policyId: doc.id }, tx);
        await accessApprovalPolicyEnvironmentDAL.insertMany(
          envs.map((env) => ({ policyId: doc.id, envId: env.id })),
          tx
        );
      }

      await accessApprovalPolicyBypasserDAL.delete({ policyId: doc.id }, tx);

      if (bypasserUserIds.length) {
        await verifyProjectUserMembership(bypasserUserIds, actorOrgId, accessApprovalPolicy.projectId);

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
      environments: accessApprovalPolicy.environments,
      environment: accessApprovalPolicy.environments[0],
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
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
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

    return {
      ...policy,
      environment: policy.environments[0]
    };
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

    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const environment = await projectEnvDAL.findOne({ projectId: project.id, slug: envSlug });
    if (!environment) throw new NotFoundError({ message: `Environment with slug '${envSlug}' not found` });

    const policies = await accessApprovalPolicyDAL.find(
      {
        projectId: project.id,
        deletedAt: null
      },
      { envId: environment.id }
    );
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
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);

    return {
      ...policy,
      environment: policy.environments[0]
    };
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
