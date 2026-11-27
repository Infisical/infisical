import { Knex } from "knex";

import { ResourceLimit, TResourceLimits } from "@app/lib/resource-limits";

import { TApprovalPolicySecretEnvironmentDALFactory } from "./approval-policy-dal";

// Only environments the policy is joining are counted. Moving a policy between environments would otherwise grow the
// destination past the cap, while counting environments it already covers would lock edits on one already over it.
export const assertApprovalPolicyEnvironmentCapacity = async (
  {
    approvalPolicySecretEnvironmentDAL,
    resourceLimits,
    envs,
    currentEnvIds = [],
    describe
  }: {
    approvalPolicySecretEnvironmentDAL: Pick<TApprovalPolicySecretEnvironmentDALFactory, "countPoliciesByEnvIds">;
    resourceLimits: TResourceLimits;
    envs: { id: string; slug: string }[];
    currentEnvIds?: string[];
    describe: (envSlug: string, max: number) => string;
  },
  tx: Knex
) => {
  if (resourceLimits.max(ResourceLimit.ApprovalPoliciesPerEnvironment) === null) return;

  const current = new Set(currentEnvIds);
  const joiningEnvs = envs.filter((env) => !current.has(env.id));
  if (!joiningEnvs.length) return;

  const policiesByEnv = await approvalPolicySecretEnvironmentDAL.countPoliciesByEnvIds(
    joiningEnvs.map((env) => env.id),
    tx
  );
  joiningEnvs.forEach((env) =>
    resourceLimits.assertWithin({
      limit: ResourceLimit.ApprovalPoliciesPerEnvironment,
      used: policiesByEnv[env.id] ?? 0,
      describe: (max) => describe(env.slug, max)
    })
  );
};
