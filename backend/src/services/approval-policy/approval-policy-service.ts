import { ActionProjectType, ProjectMembershipRole, TApprovalPolicies } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ForbiddenRequestError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import {
  TApprovalPolicyDALFactory,
  TApprovalPolicyStepApproversDALFactory,
  TApprovalPolicyStepsDALFactory
} from "./approval-policy-dal";
import { ApprovalPolicyType, ApproverType } from "./approval-policy-enums";
import { TCreatePolicyDTO, TUpdatePolicyDTO } from "./approval-policy-types";

type TApprovalPolicyServiceFactoryDep = {
  approvalPolicyDAL: TApprovalPolicyDALFactory;
  approvalPolicyStepsDAL: TApprovalPolicyStepsDALFactory;
  approvalPolicyStepApproversDAL: TApprovalPolicyStepApproversDALFactory;
  projectDAL: TProjectDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
};
export type TApprovalPolicyServiceFactory = ReturnType<typeof approvalPolicyServiceFactory>;

export const approvalPolicyServiceFactory = ({
  approvalPolicyDAL,
  approvalPolicyStepsDAL,
  approvalPolicyStepApproversDAL,
  permissionService
}: TApprovalPolicyServiceFactoryDep) => {
  const create = async (
    policyType: ApprovalPolicyType,
    { projectId, organizationId, name, maxRequestTtlSeconds, conditions, constraints, steps }: TCreatePolicyDTO,
    actor: OrgServiceActor
  ) => {
    const { hasRole } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.Any
    });

    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
    }

    const policy = await approvalPolicyDAL.transaction(async (tx) => {
      const newPolicy = await approvalPolicyDAL.create(
        {
          projectId,
          organizationId,
          name,
          maxRequestTtlSeconds,
          conditions: { version: 1, conditions },
          constraints: { version: 1, constraints },
          type: policyType
        },
        tx
      );

      // Create policy steps and their approvers
      await Promise.all(
        steps.map(async (step, i) => {
          const newStep = await approvalPolicyStepsDAL.create(
            {
              policyId: newPolicy.id,
              requiredApprovals: step.requiredApprovals,
              stepNumber: i + 1,
              name: step.name,
              notifyApprovers: step.notifyApprovers
            },
            tx
          );

          if (step.approvers?.length) {
            await Promise.all(
              step.approvers.map((approver) =>
                approvalPolicyStepApproversDAL.create(
                  {
                    policyStepId: newStep.id,
                    userId: approver.type === ApproverType.User ? approver.id : null,
                    groupId: approver.type === ApproverType.Group ? approver.id : null
                  },
                  tx
                )
              )
            );
          }
        })
      );

      return newPolicy;
    });

    return {
      policy
    };
  };

  const updateById = async (
    policyId: string,
    { name, maxRequestTtlSeconds, conditions, constraints, steps }: TUpdatePolicyDTO,
    actor: OrgServiceActor
  ) => {
    const policy = await approvalPolicyDAL.findById(policyId);
    if (!policy) {
      throw new ForbiddenRequestError({ message: "Policy not found" });
    }

    const { hasRole } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: policy.projectId,
      actionProjectType: ActionProjectType.Any
    });

    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
    }

    const updatedPolicy = await approvalPolicyDAL.transaction(async (tx) => {
      const updateDoc: Partial<TApprovalPolicies> = {};

      if (name !== undefined) {
        updateDoc.name = name;
      }

      if (maxRequestTtlSeconds !== undefined) {
        updateDoc.maxRequestTtlSeconds = maxRequestTtlSeconds;
      }

      if (conditions !== undefined) {
        updateDoc.conditions = { version: 1, conditions };
      }

      if (constraints !== undefined) {
        updateDoc.constraints = { version: 1, constraints };
      }

      const updated = await approvalPolicyDAL.updateById(policyId, updateDoc, tx);

      if (steps !== undefined) {
        await approvalPolicyStepsDAL.delete({ policyId }, tx);

        await Promise.all(
          steps.map(async (step, i) => {
            const newStep = await approvalPolicyStepsDAL.create(
              {
                policyId,
                requiredApprovals: step.requiredApprovals,
                stepNumber: i + 1,
                name: step.name,
                notifyApprovers: step.notifyApprovers
              },
              tx
            );

            if (step.approvers?.length) {
              await Promise.all(
                step.approvers.map((approver) =>
                  approvalPolicyStepApproversDAL.create(
                    {
                      policyStepId: newStep.id,
                      userId: approver.type === ApproverType.User ? approver.id : null,
                      groupId: approver.type === ApproverType.Group ? approver.id : null
                    },
                    tx
                  )
                )
              );
            }
          })
        );
      }
      return updated;
    });

    return {
      policy: updatedPolicy
    };
  };

  const deleteById = async (policyId: string, actor: OrgServiceActor) => {
    const policy = await approvalPolicyDAL.findById(policyId);
    if (!policy) {
      throw new ForbiddenRequestError({ message: "Policy not found" });
    }

    const { hasRole } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: policy.projectId,
      actionProjectType: ActionProjectType.Any
    });

    if (!hasRole(ProjectMembershipRole.Admin)) {
      throw new ForbiddenRequestError({ message: "User has insufficient privileges" });
    }

    const deletedPolicy = await approvalPolicyDAL.deleteById(policyId);

    return {
      policy: deletedPolicy
    };
  };

  return {
    create,
    updateById,
    deleteById
  };
};
