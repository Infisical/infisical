import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { ActionProjectType, ProjectVersion } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { approvalPolicyMembershipVerifierFactory } from "../access-approval-policy/access-approval-policy-fns";
import { ApproverType, BypasserType } from "../access-approval-policy/access-approval-policy-types";
import { TLicenseServiceFactory } from "../license/license-service";
import { TSecretApprovalRequestDALFactory } from "../secret-approval-request/secret-approval-request-dal";
import { RequestState } from "../secret-approval-request/secret-approval-request-types";
import { TSecretChangePolicyBridgeServiceFactory } from "../secret-change-policy-bridge/secret-change-policy-bridge-service";
import {
  TSecretApprovalPolicyApproverDALFactory,
  TSecretApprovalPolicyBypasserDALFactory
} from "./secret-approval-policy-approver-dal";
import { TSecretApprovalPolicyDALFactory } from "./secret-approval-policy-dal";
import { TSecretApprovalPolicyEnvironmentDALFactory } from "./secret-approval-policy-environment-dal";
import { resolvePolicyForPath } from "./secret-approval-policy-fns";
import {
  TCreateSapDTO,
  TDeleteSapDTO,
  TGetBoardSapDTO,
  TGetSapByIdDTO,
  TListSapDTO,
  TUpdateSapDTO
} from "./secret-approval-policy-types";

type TSecretApprovalPolicyServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretApprovalPolicyDAL: TSecretApprovalPolicyDALFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne" | "find">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findEffectiveProjectSubjectsMembership">;
  userDAL: Pick<TUserDALFactory, "find">;
  secretApprovalPolicyApproverDAL: TSecretApprovalPolicyApproverDALFactory;
  secretApprovalPolicyBypasserDAL: TSecretApprovalPolicyBypasserDALFactory;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  secretApprovalRequestDAL: Pick<TSecretApprovalRequestDALFactory, "update">;
  secretApprovalPolicyEnvironmentDAL: TSecretApprovalPolicyEnvironmentDALFactory;
  secretChangePolicyBridgeService: Pick<
    TSecretChangePolicyBridgeServiceFactory,
    | "findSecretChangePolicy"
    | "findSecretChangePolicyBySecretPath"
    | "findSecretChangePoliciesByEnvId"
    | "findSecretChangePoliciesByProjectId"
    | "createSecretChangePolicy"
    | "updateSecretChangePolicy"
    | "deleteSecretChangePolicy"
    | "getSecretChangePolicyById"
  >;
};

export type TSecretApprovalPolicyServiceFactory = ReturnType<typeof secretApprovalPolicyServiceFactory>;

export const secretApprovalPolicyServiceFactory = ({
  secretApprovalPolicyDAL,
  permissionService,
  secretApprovalPolicyApproverDAL,
  secretApprovalPolicyBypasserDAL,
  secretApprovalPolicyEnvironmentDAL,
  projectEnvDAL,
  projectDAL,
  userDAL,
  licenseService,
  secretApprovalRequestDAL,
  secretChangePolicyBridgeService
}: TSecretApprovalPolicyServiceFactoryDep) => {
  const { verifyProjectSubjectsMembership } = approvalPolicyMembershipVerifierFactory({ projectDAL });

  const $policyExists = async ({
    envIds,
    envId,
    secretPath,
    policyId
  }: {
    envIds?: string[];
    envId?: string;
    secretPath: string;
    policyId?: string;
  }) => {
    if (!envIds && !envId) {
      throw new BadRequestError({ message: "At least one environment should be provided" });
    }
    const policyEnvIds = envId ? [envId] : envIds || [];
    const policies = await Promise.all([
      secretApprovalPolicyDAL.findPolicyByEnvIdAndSecretPath({ envIds: policyEnvIds, secretPath }),
      secretChangePolicyBridgeService.findSecretChangePolicyBySecretPath({ envIds: policyEnvIds, secretPath })
    ]);

    return policies.some((policy) => policy && policy.id !== policyId);
  };

  const $useSecretChangePolicyBridge = async (policyId: string) =>
    Boolean(await secretChangePolicyBridgeService.findSecretChangePolicy(policyId));

  const createSecretApprovalPolicy = async (dto: TCreateSapDTO) => {
    const project = await projectDAL.findById(dto.projectId);
    if (project?.version === ProjectVersion.V3) {
      return secretChangePolicyBridgeService.createSecretChangePolicy(dto);
    }

    const {
      name,
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      approvals,
      approvers,
      bypassers,
      projectId,
      secretPath,
      environment,
      environments,
      enforcementLevel,
      allowedSelfApprovals,
      bypassForMachineIdentities
    } = dto;
    const groupApprovers = approvers
      ?.filter((approver) => approver.type === ApproverType.Group)
      .map((approver) => approver.id)
      .filter(Boolean) as string[];
    const userApprovers = approvers
      ?.filter((approver) => approver.type === ApproverType.User)
      .map((approver) => approver.id)
      .filter(Boolean) as string[];

    const userApproverNames = approvers
      .map((approver) => (approver.type === ApproverType.User ? approver.username : undefined))
      .filter(Boolean) as string[];

    if (!groupApprovers.length && approvals > approvers.length)
      throw new BadRequestError({ message: "Approvals cannot be greater than approvers" });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretApproval
    );

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message:
          "Failed to create secret approval policy due to plan restriction. Upgrade plan to create secret approval policy."
      });
    }

    const mergedEnvs = (environment ? [environment] : environments) || [];
    if (mergedEnvs.length === 0) {
      throw new BadRequestError({ message: "Must provide either environment or environments" });
    }
    const envs = await projectEnvDAL.find({ $in: { slug: mergedEnvs }, projectId });
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

    const secretApproval = await secretApprovalPolicyDAL.transaction(async (tx) => {
      const doc = await secretApprovalPolicyDAL.create(
        {
          envId: envs[0].id,
          approvals,
          secretPath,
          name,
          enforcementLevel,
          allowedSelfApprovals,
          bypassForMachineIdentities
        },
        tx
      );

      await secretApprovalPolicyEnvironmentDAL.insertMany(
        envs.map((env) => ({
          envId: env.id,
          policyId: doc.id
        })),
        tx
      );

      let userApproverIds = userApprovers;
      if (userApproverNames.length) {
        const approverUsers = await userDAL.find(
          {
            $in: {
              username: userApproverNames
            }
          },
          { tx }
        );

        const approverNamesFromDb = approverUsers.map((user) => user.username);
        const invalidUsernames = userApproverNames?.filter((username) => !approverNamesFromDb.includes(username));

        if (invalidUsernames?.length) {
          throw new BadRequestError({
            message: `Invalid approver user: ${invalidUsernames.join(", ")}`
          });
        }

        userApproverIds = userApproverIds.concat(approverUsers.map((user) => user.id));
      }

      // verify user and group membership before inserting approvers
      await verifyProjectSubjectsMembership({
        userIds: userApproverIds,
        groupIds: groupApprovers,
        orgId: actorOrgId,
        projectId
      });

      await secretApprovalPolicyApproverDAL.insertMany(
        userApproverIds.map((approverUserId) => ({
          approverUserId,
          policyId: doc.id
        })),
        tx
      );

      await secretApprovalPolicyApproverDAL.insertMany(
        groupApprovers.map((approverGroupId) => ({
          approverGroupId,
          policyId: doc.id
        })),
        tx
      );

      if (bypasserUserIds.length) {
        await verifyProjectSubjectsMembership({
          userIds: bypasserUserIds,
          groupIds: [],
          orgId: actorOrgId,
          projectId
        });

        await secretApprovalPolicyBypasserDAL.insertMany(
          bypasserUserIds.map((userId) => ({
            bypasserUserId: userId,
            policyId: doc.id
          })),
          tx
        );
      }

      if (groupBypassers.length) {
        await verifyProjectSubjectsMembership({
          userIds: [],
          groupIds: groupBypassers,
          orgId: actorOrgId,
          projectId
        });

        await secretApprovalPolicyBypasserDAL.insertMany(
          groupBypassers.map((groupId) => ({
            bypasserGroupId: groupId,
            policyId: doc.id
          })),
          tx
        );
      }

      return doc;
    });

    return { ...secretApproval, environments: envs, projectId, environment: envs[0] };
  };

  const updateSecretApprovalPolicy = async (dto: TUpdateSapDTO) => {
    if (await $useSecretChangePolicyBridge(dto.secretPolicyId)) {
      return secretChangePolicyBridgeService.updateSecretChangePolicy(dto);
    }

    const {
      approvers,
      bypassers,
      environments,
      secretPath,
      name,
      actorId,
      actor,
      actorOrgId,
      actorAuthMethod,
      approvals,
      secretPolicyId,
      enforcementLevel,
      allowedSelfApprovals,
      bypassForMachineIdentities
    } = dto;

    const groupApprovers = approvers
      ?.filter((approver) => approver.type === ApproverType.Group)
      .map((approver) => approver.id)
      .filter(Boolean) as string[];
    const userApprovers = approvers
      ?.filter((approver) => approver.type === ApproverType.User)
      .map((approver) => approver.id)
      .filter(Boolean) as string[];

    const userApproverNames = approvers
      .map((approver) => (approver.type === ApproverType.User ? approver.username : undefined))
      .filter(Boolean) as string[];

    const secretApprovalPolicy = await secretApprovalPolicyDAL.findById(secretPolicyId);
    if (!secretApprovalPolicy) {
      throw new NotFoundError({
        message: `Secret approval policy with ID '${secretPolicyId}' not found`
      });
    }
    let envs = secretApprovalPolicy.environments;
    if (
      environments &&
      (environments.length !== envs.length || environments.some((env) => !envs.find((el) => el.slug === env)))
    ) {
      envs = await projectEnvDAL.find({ $in: { slug: environments }, projectId: secretApprovalPolicy.projectId });
    }
    for (const env of envs) {
      if (
        // eslint-disable-next-line no-await-in-loop
        await $policyExists({
          envId: env.id,
          secretPath: secretPath || secretApprovalPolicy.secretPath,
          policyId: secretApprovalPolicy.id
        })
      ) {
        throw new BadRequestError({
          message: `A policy for secret path '${secretPath || secretApprovalPolicy.secretPath}' already exists in environment '${env.slug}'`
        });
      }
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: secretApprovalPolicy.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretApproval);

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message:
          "Failed to update secret approval policy due to plan restriction. Upgrade plan to update secret approval policy."
      });
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

    const updatedSap = await secretApprovalPolicyDAL.transaction(async (tx) => {
      const doc = await secretApprovalPolicyDAL.updateById(
        secretApprovalPolicy.id,
        {
          approvals,
          secretPath,
          name,
          enforcementLevel,
          allowedSelfApprovals,
          bypassForMachineIdentities
        },
        tx
      );

      await secretApprovalPolicyApproverDAL.delete({ policyId: doc.id }, tx);

      if (approvers) {
        let userApproverIds = userApprovers;
        if (userApproverNames) {
          const approverUsers = await userDAL.find(
            {
              $in: {
                username: userApproverNames
              }
            },
            { tx }
          );

          const approverNamesFromDb = approverUsers.map((user) => user.username);
          const invalidUsernames = userApproverNames?.filter((username) => !approverNamesFromDb.includes(username));

          if (invalidUsernames?.length) {
            throw new BadRequestError({
              message: `Invalid approver user: ${invalidUsernames.join(", ")}`
            });
          }

          userApproverIds = userApproverIds.concat(approverUsers.map((user) => user.id));
        }

        await verifyProjectSubjectsMembership({
          userIds: userApproverIds,
          groupIds: groupApprovers ?? [],
          orgId: actorOrgId,
          projectId: secretApprovalPolicy.projectId
        });

        await secretApprovalPolicyApproverDAL.insertMany(
          userApproverIds.map((approverUserId) => ({
            approverUserId,
            policyId: doc.id
          })),
          tx
        );
      }

      if (groupApprovers) {
        await secretApprovalPolicyApproverDAL.insertMany(
          groupApprovers.map((approverGroupId) => ({
            approverGroupId,
            policyId: doc.id
          })),
          tx
        );
      }

      if (environments) {
        await secretApprovalPolicyEnvironmentDAL.delete({ policyId: doc.id }, tx);
        await secretApprovalPolicyEnvironmentDAL.insertMany(
          envs.map((env) => ({
            envId: env.id,
            policyId: doc.id
          })),
          tx
        );
      }

      await secretApprovalPolicyBypasserDAL.delete({ policyId: doc.id }, tx);

      if (bypasserUserIds.length) {
        await verifyProjectSubjectsMembership({
          userIds: bypasserUserIds,
          groupIds: [],
          orgId: actorOrgId,
          projectId: secretApprovalPolicy.projectId
        });

        await secretApprovalPolicyBypasserDAL.insertMany(
          bypasserUserIds.map((userId) => ({
            bypasserUserId: userId,
            policyId: doc.id
          })),
          tx
        );
      }

      if (groupBypassers.length) {
        await verifyProjectSubjectsMembership({
          userIds: [],
          groupIds: groupBypassers,
          orgId: actorOrgId,
          projectId: secretApprovalPolicy.projectId
        });

        await secretApprovalPolicyBypasserDAL.insertMany(
          groupBypassers.map((groupId) => ({
            bypasserGroupId: groupId,
            policyId: doc.id
          })),
          tx
        );
      }

      return doc;
    });
    return {
      ...updatedSap,
      environments: secretApprovalPolicy.environments,
      environment: secretApprovalPolicy.environments[0],
      projectId: secretApprovalPolicy.projectId
    };
  };

  const deleteSecretApprovalPolicy = async (dto: TDeleteSapDTO) => {
    if (await $useSecretChangePolicyBridge(dto.secretPolicyId)) {
      return secretChangePolicyBridgeService.deleteSecretChangePolicy(dto);
    }

    const { secretPolicyId, actor, actorId, actorAuthMethod, actorOrgId } = dto;

    const sapPolicy = await secretApprovalPolicyDAL.findById(secretPolicyId);
    if (!sapPolicy)
      throw new NotFoundError({ message: `Secret approval policy with ID '${secretPolicyId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: sapPolicy.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.SecretApproval
    );

    const deletedPolicy = await secretApprovalPolicyDAL.transaction(async (tx) => {
      await secretApprovalRequestDAL.update(
        { policyId: secretPolicyId, status: RequestState.Open },
        { status: RequestState.Closed },
        tx
      );
      const updatedPolicy = await secretApprovalPolicyDAL.softDeleteById(secretPolicyId, tx);
      return updatedPolicy;
    });
    return {
      ...deletedPolicy,
      projectId: sapPolicy.projectId,
      environments: sapPolicy.environments,
      environment: sapPolicy.environments[0]
    };
  };

  const getSecretApprovalPolicyByProjectId = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TListSapDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);

    const [legacyPolicies, secretChangePolicies] = await Promise.all([
      secretApprovalPolicyDAL.find({ projectId, deletedAt: null }),
      secretChangePolicyBridgeService.findSecretChangePoliciesByProjectId(projectId)
    ]);
    return [...legacyPolicies, ...secretChangePolicies].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  };

  const findEnvPolicies = async (projectId: string, environment: string, tx?: Knex) => {
    const env = await projectEnvDAL.findOne({ slug: environment, projectId }, tx);
    if (!env) {
      throw new NotFoundError({
        message: `Environment with slug '${environment}' not found in project with ID ${projectId}`
      });
    }
    const [legacyPolicies, secretChangePolicies] = await Promise.all([
      secretApprovalPolicyDAL.find({ deletedAt: null }, { envId: env.id }, tx),
      secretChangePolicyBridgeService.findSecretChangePoliciesByEnvId(env.id, tx)
    ]);
    return [...legacyPolicies, ...secretChangePolicies];
  };

  const getSecretApprovalPolicy = async (projectId: string, environment: string, path: string, tx?: Knex) => {
    const policies = await findEnvPolicies(projectId, environment, tx);
    if (!policies.length) return;
    return resolvePolicyForPath(policies, removeTrailingSlash(path));
  };

  const getSecretApprovalPolicyByPaths = async (
    projectId: string,
    environment: string,
    secretPaths: string[],
    tx?: Knex
  ) => {
    const policyByPath = new Map<string, Awaited<ReturnType<typeof findEnvPolicies>>[number]>();
    const policies = await findEnvPolicies(projectId, environment, tx);
    if (!policies.length) return policyByPath;

    for (const path of secretPaths) {
      const policy = resolvePolicyForPath(policies, removeTrailingSlash(path));
      if (policy) policyByPath.set(path, policy);
    }
    return policyByPath;
  };

  const getSecretApprovalPolicyOfFolder = async ({
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environment,
    secretPath
  }: TGetBoardSapDTO) => {
    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    return getSecretApprovalPolicy(projectId, environment, secretPath);
  };

  const getSecretApprovalPolicyById = async (dto: TGetSapByIdDTO) => {
    if (await $useSecretChangePolicyBridge(dto.sapId)) {
      return secretChangePolicyBridgeService.getSecretChangePolicyById(dto);
    }

    const { actorId, actor, actorOrgId, actorAuthMethod, sapId } = dto;
    const [sapPolicy] = await secretApprovalPolicyDAL.find({}, { sapId });

    if (!sapPolicy) {
      throw new NotFoundError({
        message: `Secret approval policy with ID '${sapId}' not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: sapPolicy.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);

    return sapPolicy;
  };

  return {
    createSecretApprovalPolicy,
    updateSecretApprovalPolicy,
    deleteSecretApprovalPolicy,
    getSecretApprovalPolicy,
    getSecretApprovalPolicyByPaths,
    getSecretApprovalPolicyByProjectId,
    getSecretApprovalPolicyOfFolder,
    getSecretApprovalPolicyById
  };
};
