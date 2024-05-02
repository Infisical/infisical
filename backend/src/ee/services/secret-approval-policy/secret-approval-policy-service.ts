import { ForbiddenError, subject } from "@casl/ability";
import picomatch from "picomatch";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { containsGlobPatterns } from "@app/lib/picomatch";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TSecretApprovalPolicyApproverDALFactory } from "./secret-approval-policy-approver-dal";
import { TSecretApprovalPolicyDALFactory } from "./secret-approval-policy-dal";
import {
  TCreateSapDTO,
  TDeleteSapDTO,
  TGetBoardSapDTO,
  TListSapDTO,
  TUpdateSapDTO
} from "./secret-approval-policy-types";

const getPolicyScore = (policy: { secretPath?: string | null }) =>
  // if glob pattern score is 1, if not exist score is 0 and if its not both then its exact path meaning score 2
  // eslint-disable-next-line
  policy.secretPath ? (containsGlobPatterns(policy.secretPath) ? 1 : 2) : 0;

type TSecretApprovalPolicyServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretApprovalPolicyDAL: TSecretApprovalPolicyDALFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  secretApprovalPolicyApproverDAL: TSecretApprovalPolicyApproverDALFactory;
  projectMembershipDAL: Pick<TProjectMembershipDALFactory, "find">;
  userDAL: Pick<TUserDALFactory, "findUsersByProjectId" | "findUserByProjectId">;
};

export type TSecretApprovalPolicyServiceFactory = ReturnType<typeof secretApprovalPolicyServiceFactory>;

export const secretApprovalPolicyServiceFactory = ({
  secretApprovalPolicyDAL,
  permissionService,
  secretApprovalPolicyApproverDAL,
  projectEnvDAL,
  userDAL
}: TSecretApprovalPolicyServiceFactoryDep) => {
  const createSecretApprovalPolicy = async ({
    name,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    approvals,
    approvers,
    projectId,
    secretPath,
    environment
  }: TCreateSapDTO) => {
    if (approvals > approvers.length)
      throw new BadRequestError({ message: "Approvals cannot be greater than approvers" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretApproval
    );
    const env = await projectEnvDAL.findOne({ slug: environment, projectId });
    if (!env) throw new BadRequestError({ message: "Environment not found" });

    const secretApproverUsers = await userDAL.findUsersByProjectId(
      projectId,
      approvers.map((approverUserId) => approverUserId)
    );

    if (secretApproverUsers.length !== approvers.length)
      throw new BadRequestError({ message: "Approver not found in project" });

    const secretApproval = await secretApprovalPolicyDAL.transaction(async (tx) => {
      const doc = await secretApprovalPolicyDAL.create(
        {
          envId: env.id,
          approvals,
          secretPath,
          name
        },
        tx
      );
      await secretApprovalPolicyApproverDAL.insertMany(
        secretApproverUsers.map(({ id }) => ({
          approverUserId: id,
          policyId: doc.id
        })),
        tx
      );
      return doc;
    });
    return { ...secretApproval, environment: env, projectId };
  };

  const updateSecretApprovalPolicy = async ({
    approvers,
    secretPath,
    name,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    approvals,
    secretPolicyId
  }: TUpdateSapDTO) => {
    const secretApprovalPolicy = await secretApprovalPolicyDAL.findById(secretPolicyId);
    if (!secretApprovalPolicy) throw new BadRequestError({ message: "Secret approval policy not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      secretApprovalPolicy.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretApproval);

    const updatedSap = await secretApprovalPolicyDAL.transaction(async (tx) => {
      const doc = await secretApprovalPolicyDAL.updateById(
        secretApprovalPolicy.id,
        {
          approvals,
          secretPath,
          name
        },
        tx
      );
      if (approvers) {
        const secretApproverUsers = await userDAL.findUsersByProjectId(
          secretApprovalPolicy.projectId,
          approvers.map((approverUserId) => approverUserId)
        );

        if (secretApproverUsers.length !== approvers.length)
          throw new BadRequestError({ message: "Approver not found in project" });
        if (doc.approvals > secretApproverUsers.length)
          throw new BadRequestError({ message: "Approvals cannot be greater than approvers" });
        await secretApprovalPolicyApproverDAL.delete({ policyId: doc.id }, tx);
        await secretApprovalPolicyApproverDAL.insertMany(
          secretApproverUsers.map((user) => ({
            approverUserId: user.id,
            policyId: doc.id
          })),
          tx
        );
      }
      return doc;
    });
    return {
      ...updatedSap,
      environment: secretApprovalPolicy.environment,
      projectId: secretApprovalPolicy.projectId
    };
  };

  const deleteSecretApprovalPolicy = async ({
    secretPolicyId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteSapDTO) => {
    const sapPolicy = await secretApprovalPolicyDAL.findById(secretPolicyId);
    if (!sapPolicy) throw new BadRequestError({ message: "Secret approval policy not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      sapPolicy.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.SecretApproval
    );

    await secretApprovalPolicyDAL.deleteById(secretPolicyId);
    return sapPolicy;
  };

  const getSecretApprovalPolicyByProjectId = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectId
  }: TListSapDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);

    const sapPolicies = await secretApprovalPolicyDAL.find({ projectId });
    return sapPolicies;
  };

  const getSecretApprovalPolicy = async (projectId: string, environment: string, secretPath: string) => {
    const env = await projectEnvDAL.findOne({ slug: environment, projectId });
    if (!env) throw new BadRequestError({ message: "Environment not found" });

    const policies = await secretApprovalPolicyDAL.find({ envId: env.id });
    if (!policies.length) return;
    // this will filter policies either without scoped to secret path or the one that matches with secret path
    const policiesFilteredByPath = policies.filter(
      ({ secretPath: policyPath }) => !policyPath || picomatch.isMatch(secretPath, policyPath, { strictSlashes: false })
    );
    // now sort by priority. exact secret path gets first match followed by glob followed by just env scoped
    // if that is tie get by first createdAt
    const policiesByPriority = policiesFilteredByPath.sort((a, b) => getPolicyScore(b) - getPolicyScore(a));
    const finalPolicy = policiesByPriority.shift();
    return finalPolicy;
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
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { secretPath, environment })
    );
    return getSecretApprovalPolicy(projectId, environment, secretPath);
  };

  return {
    createSecretApprovalPolicy,
    updateSecretApprovalPolicy,
    deleteSecretApprovalPolicy,
    getSecretApprovalPolicy,
    getSecretApprovalPolicyByProjectId,
    getSecretApprovalPolicyOfFolder
  };
};
