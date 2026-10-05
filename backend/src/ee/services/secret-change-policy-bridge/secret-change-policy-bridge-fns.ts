import { Knex } from "knex";

import { TProjectEnvironments } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { approvalPolicyMembershipVerifierFactory } from "../access-approval-policy/access-approval-policy-fns";
import { BypasserType } from "../access-approval-policy/access-approval-policy-types";
import { TSecretApprovalPolicyDALFactory } from "../secret-approval-policy/secret-approval-policy-dal";
import { TCreateSapDTO } from "../secret-approval-policy/secret-approval-policy-types";
import { TApprovalPolicySecretEnvironmentDALFactory } from "./secret-change-policy-environment-dal";

type TSecretChangePolicyFnsFactoryDep = {
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findOne">;
  approvalPolicySecretEnvironmentDAL: Pick<
    TApprovalPolicySecretEnvironmentDALFactory,
    "findPolicyByEnvIdAndSecretPath"
  >;
  secretApprovalPolicyDAL: Pick<TSecretApprovalPolicyDALFactory, "findPolicyByEnvIdAndSecretPath">;
  projectDAL: Pick<TProjectDALFactory, "findEffectiveProjectSubjectsMembership">;
  userDAL: Pick<TUserDALFactory, "find">;
};

export const secretChangePolicyFnsFactory = ({
  approvalPolicyDAL,
  approvalPolicySecretEnvironmentDAL,
  secretApprovalPolicyDAL,
  projectDAL,
  userDAL
}: TSecretChangePolicyFnsFactoryDep) => {
  const { verifyProjectSubjectsMembership } = approvalPolicyMembershipVerifierFactory({ projectDAL });

  const findSecretChangePolicy = (policyId: string, tx?: Knex) =>
    approvalPolicyDAL.findOne({ id: policyId, type: ApprovalPolicyType.SecretChange }, tx);

  const findSecretChangePolicyBySecretPath = (
    { envIds, secretPath }: { envIds: string[]; secretPath: string },
    tx?: Knex
  ) => approvalPolicySecretEnvironmentDAL.findPolicyByEnvIdAndSecretPath({ envIds, secretPath }, tx);

  // Policies are being migrated onto the approval system, so a path is taken whether the policy that
  // governs it still lives on the legacy secret approval tables or already lives on the new ones.
  const assertNoPolicyForSecretPath = async ({
    envs,
    secretPath
  }: {
    envs: Pick<TProjectEnvironments, "id" | "slug">[];
    secretPath: string;
  }) => {
    const envIds = envs.map((env) => env.id);
    const [secretChangePolicy, legacyPolicy] = await Promise.all([
      approvalPolicySecretEnvironmentDAL.findPolicyByEnvIdAndSecretPath({ envIds, secretPath }),
      secretApprovalPolicyDAL.findPolicyByEnvIdAndSecretPath({ envIds, secretPath })
    ]);
    const existingPolicy = secretChangePolicy || legacyPolicy;
    if (!existingPolicy) return;

    const governedEnvIds = new Set(existingPolicy.environments.map((env) => env.id));
    const env = envs.find((el) => governedEnvIds.has(el.id)) ?? envs[0];
    throw new BadRequestError({
      message: `A policy for secret path '${secretPath}' already exists in environment '${env.slug}'`
    });
  };

  const resolveBypassers = async (bypassers: TCreateSapDTO["bypassers"]) => {
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

    return { bypasserUserIds, groupBypassers };
  };

  const resolveApproverUserIds = async ({
    userApprovers,
    userApproverNames
  }: {
    userApprovers: string[];
    userApproverNames: string[];
  }) => {
    if (!userApproverNames.length) return userApprovers;

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

    return userApprovers.concat(approverUsers.map((user) => user.id));
  };

  const verifyPolicyActorsMembership = async ({
    userApproverIds,
    groupApprovers,
    bypasserUserIds,
    groupBypassers,
    orgId,
    projectId
  }: {
    userApproverIds: string[];
    groupApprovers: string[];
    bypasserUserIds: string[];
    groupBypassers: string[];
    orgId: string;
    projectId: string;
  }) => {
    await verifyProjectSubjectsMembership({
      userIds: userApproverIds,
      groupIds: groupApprovers,
      orgId,
      projectId
    });

    if (bypasserUserIds.length) {
      await verifyProjectSubjectsMembership({
        userIds: bypasserUserIds,
        groupIds: [],
        orgId,
        projectId
      });
    }

    if (groupBypassers.length) {
      await verifyProjectSubjectsMembership({
        userIds: [],
        groupIds: groupBypassers,
        orgId,
        projectId
      });
    }
  };

  return {
    findSecretChangePolicy,
    findSecretChangePolicyBySecretPath,
    assertNoPolicyForSecretPath,
    resolveBypassers,
    resolveApproverUserIds,
    verifyPolicyActorsMembership
  };
};
