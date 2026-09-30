import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { approvalPolicyMembershipVerifierFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-fns";
import { ApproverType, BypasserType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";

import { secretAccessApprovalPolicyExists } from "./secret-access-approval-bridge-fns";
import {
  TCreateSecretAccessApprovalPolicyDTO,
  TCreateSecretAccessApprovalRequestDTO,
  TSecretAccessApprovalBridgeServiceFactoryDep
} from "./secret-access-approval-bridge-types";

export type TSecretAccessApprovalBridgeServiceFactory = ReturnType<typeof secretAccessApprovalBridgeServiceFactory>;

export const secretAccessApprovalBridgeServiceFactory = ({
  projectDAL,
  permissionService,
  projectEnvDAL,
  userDAL,
  accessApprovalPolicyDAL,
  approvalPolicyDAL,
  approvalPolicyStepsDAL,
  approvalPolicyStepApproversDAL,
  approvalPolicyBypassersDAL,
  approvalPolicySecretEnvironmentDAL
}: TSecretAccessApprovalBridgeServiceFactoryDep) => {
  const { verifyProjectSubjectsMembership } = approvalPolicyMembershipVerifierFactory({ projectDAL });

  const createAccessApprovalPolicy = async ({
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
    maxTimePeriod,
    requestExpirationTime
  }: TCreateSecretAccessApprovalPolicyDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });

    const groupApprovers = approvers.filter((approver) => approver.type === ApproverType.Group) as {
      id: string;
      sequence?: number;
    }[];

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
      if (
        // eslint-disable-next-line no-await-in-loop
        await secretAccessApprovalPolicyExists(
          { envId: env.id, secretPath },
          { accessApprovalPolicyDAL, approvalPolicySecretEnvironmentDAL }
        )
      ) {
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

    if (approverUserIds.length > 0 || groupApprovers.length > 0) {
      await verifyProjectSubjectsMembership({
        userIds: approverUserIds.map((au) => au.id),
        groupIds: groupApprovers.map((ga) => ga.id).filter(Boolean),
        orgId: project.orgId,
        projectId: project.id
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

      if (bypasserUserIds.length) {
        await verifyProjectSubjectsMembership({
          userIds: bypasserUserIds,
          groupIds: [],
          orgId: project.orgId,
          projectId: project.id
        });
      }
    }

    const approvalsRequiredGroupByStepNumber = groupBy(approvalsRequired || [], (i) => i.stepNumber);
    const stepApproversBySequence = groupBy(
      [
        ...approverUserIds.map((el) => ({ type: ApproverType.User, id: el.id, sequence: el.sequence ?? 1 })),
        ...groupApprovers.map((el) => ({ type: ApproverType.Group, id: el.id, sequence: el.sequence ?? 1 }))
      ],
      (el) => el.sequence
    );
    const steps = Object.keys(stepApproversBySequence)
      .map(Number)
      .sort((a, b) => a - b)
      .map((sequence) => ({
        sequence,
        requiredApprovals: approvalsRequiredGroupByStepNumber?.[sequence]?.[0]?.numberOfApprovals ?? approvals,
        approvers: stepApproversBySequence[sequence]
      }));

    const policy = await approvalPolicyDAL.transaction(async (tx) => {
      const doc = await approvalPolicyDAL.create(
        {
          projectId: project.id,
          organizationId: project.orgId,
          type: ApprovalPolicyType.SecretAccess,
          name,
          enforcementLevel,
          maxRequestTtl: maxTimePeriod ?? null,
          bypassForMachineIdentities: false,
          scopeType: null,
          scopeId: null,
          conditions: { version: 1, conditions: {} },
          constraints: {
            version: 1,
            constraints: { allowedSelfApprovals, requestExpirationTime: requestExpirationTime ?? null }
          }
        },
        tx
      );

      await approvalPolicySecretEnvironmentDAL.insertMany(
        envs.map((env) => ({ policyId: doc.id, envId: env.id, secretPath })),
        tx
      );

      const stepDocs = await approvalPolicyStepsDAL.insertMany(
        steps.map((step, i) => ({
          policyId: doc.id,
          stepNumber: i + 1,
          requiredApprovals: step.requiredApprovals
        })),
        tx
      );

      await approvalPolicyStepApproversDAL.insertMany(
        steps.flatMap((step, i) =>
          step.approvers.map((approver) => ({
            policyStepId: stepDocs[i].id,
            userId: approver.type === ApproverType.User ? approver.id : null,
            groupId: approver.type === ApproverType.Group ? approver.id : null
          }))
        ),
        tx
      );

      if (bypasserUserIds.length || groupBypassers.length) {
        await approvalPolicyBypassersDAL.insertMany(
          [
            ...bypasserUserIds.map((userId) => ({ policyId: doc.id, userId, groupId: null })),
            ...groupBypassers.map((groupId) => ({ policyId: doc.id, userId: null, groupId }))
          ],
          tx
        );
      }

      return doc;
    });

    return {
      id: policy.id,
      name: policy.name,
      secretPath,
      approvals,
      envId: envs[0].id,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
      enforcementLevel: policy.enforcementLevel,
      deletedAt: null,
      allowedSelfApprovals,
      bypassForMachineIdentities: false,
      maxTimePeriod: policy.maxRequestTtl ?? null,
      requestExpirationTime: requestExpirationTime ?? null,
      environment: envs[0],
      environments: envs,
      projectId: project.id
    };
  };

  const createAccessApprovalRequest: (dto: TCreateSecretAccessApprovalRequestDTO) => Promise<never> = async () => {
    throw new BadRequestError({
      message: "Secret access approval requests are not supported on the global approval system yet"
    });
  };

  return { createAccessApprovalPolicy, createAccessApprovalRequest };
};
