import { ForbiddenError, subject } from "@casl/ability";
import picomatch from "picomatch";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { containsGlobPatterns } from "@app/lib/picomatch";
import { TProjectEnvDalFactory } from "@app/services/project-env/project-env-dal";
import { TProjectMembershipDalFactory } from "@app/services/project-membership/project-membership-dal";

import { TSapApproverDalFactory } from "./sap-approver-dal";
import { TSecretApprovalPolicyDalFactory } from "./secret-approval-policy-dal";
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
  secretApprovalPolicyDal: TSecretApprovalPolicyDalFactory;
  projectEnvDal: Pick<TProjectEnvDalFactory, "findOne">;
  sapApproverDal: TSapApproverDalFactory;
  projectMembershipDal: Pick<TProjectMembershipDalFactory, "find">;
};

export type TSecretApprovalPolicyServiceFactory = ReturnType<
  typeof secretApprovalPolicyServiceFactory
>;

export const secretApprovalPolicyServiceFactory = ({
  secretApprovalPolicyDal,
  permissionService,
  sapApproverDal,
  projectEnvDal,
  projectMembershipDal
}: TSecretApprovalPolicyServiceFactoryDep) => {
  const createSap = async ({
    name,
    actor,
    actorId,
    approvals,
    approvers,
    projectId,
    secretPath,
    environment
  }: TCreateSapDTO) => {
    if (approvals > approvers.length)
      throw new BadRequestError({ message: "Approvals cannot be greater than approvers" });

    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SecretApproval
    );
    const env = await projectEnvDal.findOne({ slug: environment, projectId });
    if (!env) throw new BadRequestError({ message: "Environment not found" });

    const secretApprovers = await projectMembershipDal.find({
      projectId,
      $in: { id: approvers }
    });
    if (secretApprovers.length !== approvers.length)
      throw new BadRequestError({ message: "Approver not found in project" });

    const secretApproval = await secretApprovalPolicyDal.transaction(async (tx) => {
      const doc = await secretApprovalPolicyDal.create(
        {
          envId: env.id,
          approvals,
          secretPath,
          name
        },
        tx
      );
      await sapApproverDal.insertMany(
        secretApprovers.map(({ id }) => ({
          approverId: id,
          policyId: doc.id
        })),
        tx
      );
      return doc;
    });
    return { ...secretApproval, environment: env, projectId };
  };

  const updateSap = async ({
    approvers,
    secretPath,
    name,
    actorId,
    actor,
    approvals,
    secretPolicyId
  }: TUpdateSapDTO) => {
    const secretApprovalPolicy = await secretApprovalPolicyDal.findById(secretPolicyId);
    if (!secretApprovalPolicy)
      throw new BadRequestError({ message: "Secret approval policy not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      secretApprovalPolicy.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.SecretApproval
    );

    const updatedSap = await secretApprovalPolicyDal.transaction(async (tx) => {
      const doc = await secretApprovalPolicyDal.updateById(
        secretApprovalPolicy.id,
        {
          approvals,
          secretPath,
          name
        },
        tx
      );
      if (approvers) {
        const secretApprovers = await projectMembershipDal.find(
          {
            projectId: secretApprovalPolicy.projectId,
            $in: { id: approvers }
          },
          { tx }
        );
        if (secretApprovers.length !== approvers.length)
          throw new BadRequestError({ message: "Approver not found in project" });
        if (doc.approvals > secretApprovers.length)
          throw new BadRequestError({ message: "Approvals cannot be greater than approvers" });
        await sapApproverDal.delete({ policyId: doc.id }, tx);
        await sapApproverDal.insertMany(
          secretApprovers.map(({ id }) => ({
            approverId: id,
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

  const deleteSap = async ({ secretPolicyId, actor, actorId }: TDeleteSapDTO) => {
    const sapPolicy = await secretApprovalPolicyDal.findById(secretPolicyId);
    if (!sapPolicy) throw new BadRequestError({ message: "Secret approval policy not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      sapPolicy.projectId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.SecretApproval
    );

    await secretApprovalPolicyDal.deleteById(secretPolicyId);
    return sapPolicy;
  };

  const getSapByProjectId = async ({ actorId, actor, projectId }: TListSapDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.SecretApproval
    );

    const sapPolicies = await secretApprovalPolicyDal.find({ projectId });
    return sapPolicies;
  };

  const getSapPolicy = async (projectId: string, environment: string, secretPath: string) => {
    const env = await projectEnvDal.findOne({ slug: environment, projectId });
    if (!env) throw new BadRequestError({ message: "Environment not found" });

    const policies = await secretApprovalPolicyDal.find({ envId: env.id });
    if (!policies.length) return;
    // this will filter policies either without scoped to secret path or the one that matches with secret path
    const policiesFilteredByPath = policies.filter(
      ({ secretPath: policyPath }) =>
        !policyPath || picomatch.isMatch(secretPath, policyPath, { strictSlashes: false })
    );
    // now sort by priority. exact secret path gets first match followed by glob followed by just env scoped
    // if that is tie get by first createdAt
    const policiesByPriority = policiesFilteredByPath.sort(
      (a, b) => getPolicyScore(b) - getPolicyScore(a)
    );
    const finalPolicy = policiesByPriority.shift();
    return finalPolicy;
  };

  const getSapOfFolder = async ({
    projectId,
    actor,
    actorId,
    environment,
    secretPath
  }: TGetBoardSapDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { secretPath, environment })
    );
    return getSapPolicy(projectId, environment, secretPath);
  };

  return {
    createSap,
    updateSap,
    deleteSap,
    getSapPolicy,
    getSapByProjectId,
    getSapOfFolder
  };
};
