import { ForbiddenError, subject } from "@casl/ability";
import picomatch from "picomatch";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { containsGlobPatterns } from "@app/lib/picomatch";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { ApproverType } from "../access-approval-policy/access-approval-policy-types";
import { TLicenseServiceFactory } from "../license/license-service";
import { TSecretApprovalPolicyApproverDALFactory } from "./secret-approval-policy-approver-dal";
import { TSecretApprovalPolicyDALFactory } from "./secret-approval-policy-dal";
import {
  TCreateSapDTO,
  TDeleteSapDTO,
  TGetBoardSapDTO,
  TGetSapByIdDTO,
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
  userDAL: Pick<TUserDALFactory, "find">;
  secretApprovalPolicyApproverDAL: TSecretApprovalPolicyApproverDALFactory;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TSecretApprovalPolicyServiceFactory = ReturnType<typeof secretApprovalPolicyServiceFactory>;

export const secretApprovalPolicyServiceFactory = ({
  secretApprovalPolicyDAL,
  permissionService,
  secretApprovalPolicyApproverDAL,
  projectEnvDAL,
  userDAL,
  licenseService
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
    environment,
    enforcementLevel
  }: TCreateSapDTO) => {
    const groupApprovers = approvers
      ?.filter((approver) => approver.type === ApproverType.Group)
      .map((approver) => approver.id);
    const userApprovers = approvers
      ?.filter((approver) => approver.type === ApproverType.User)
      .map((approver) => approver.id)
      .filter(Boolean) as string[];

    const userApproverNames = approvers
      .map((approver) => (approver.type === ApproverType.User ? approver.name : undefined))
      .filter(Boolean) as string[];

    if (!groupApprovers.length && approvals > approvers.length)
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

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message:
          "Failed to create secret approval policy due to plan restriction. Upgrade plan to create secret approval policy."
      });
    }

    const env = await projectEnvDAL.findOne({ slug: environment, projectId });
    if (!env) throw new NotFoundError({ message: "Environment not found" });

    const secretApproval = await secretApprovalPolicyDAL.transaction(async (tx) => {
      const doc = await secretApprovalPolicyDAL.create(
        {
          envId: env.id,
          approvals,
          secretPath,
          name,
          enforcementLevel
        },
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
    secretPolicyId,
    enforcementLevel
  }: TUpdateSapDTO) => {
    const groupApprovers = approvers
      ?.filter((approver) => approver.type === ApproverType.Group)
      .map((approver) => approver.id);
    const userApprovers = approvers
      ?.filter((approver) => approver.type === ApproverType.User)
      .map((approver) => approver.id)
      .filter(Boolean) as string[];

    const userApproverNames = approvers
      .map((approver) => (approver.type === ApproverType.User ? approver.name : undefined))
      .filter(Boolean) as string[];

    const secretApprovalPolicy = await secretApprovalPolicyDAL.findById(secretPolicyId);
    if (!secretApprovalPolicy) throw new NotFoundError({ message: "Secret approval policy not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      secretApprovalPolicy.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.SecretApproval);

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message:
          "Failed to update secret approval policy due to plan restriction. Upgrade plan to update secret approval policy."
      });
    }

    const updatedSap = await secretApprovalPolicyDAL.transaction(async (tx) => {
      const doc = await secretApprovalPolicyDAL.updateById(
        secretApprovalPolicy.id,
        {
          approvals,
          secretPath,
          name,
          enforcementLevel
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
    if (!sapPolicy) throw new NotFoundError({ message: "Secret approval policy not found" });

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

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message:
          "Failed to update secret approval policy due to plan restriction. Upgrade plan to update secret approval policy."
      });
    }

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

  const getSecretApprovalPolicy = async (projectId: string, environment: string, path: string) => {
    const secretPath = removeTrailingSlash(path);
    const env = await projectEnvDAL.findOne({ slug: environment, projectId });
    if (!env) throw new NotFoundError({ message: "Environment not found" });

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

  const getSecretApprovalPolicyById = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    sapId
  }: TGetSapByIdDTO) => {
    const [sapPolicy] = await secretApprovalPolicyDAL.find({}, { sapId });

    if (!sapPolicy) {
      throw new NotFoundError({
        message: "Cannot find secret approval policy"
      });
    }

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      sapPolicy.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);

    return sapPolicy;
  };

  return {
    createSecretApprovalPolicy,
    updateSecretApprovalPolicy,
    deleteSecretApprovalPolicy,
    getSecretApprovalPolicy,
    getSecretApprovalPolicyByProjectId,
    getSecretApprovalPolicyOfFolder,
    getSecretApprovalPolicyById
  };
};
