import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { EnforcementLevel } from "@app/lib/types";

// The API puts every new policy on a V3 project on the global approval system, so a policy on the legacy
// approval system can only be seeded directly.
export const seedLegacySecretApprovalPolicy = async (
  db: Knex,
  dto: { projectId: string; environment: string; secretPath: string; name: string; approverUserId: string }
) => {
  const env = await db(TableName.Environment).where({ projectId: dto.projectId, slug: dto.environment }).first();
  if (!env) throw new Error(`environment '${dto.environment}' not found in project ${dto.projectId}`);

  const [policy] = await db(TableName.SecretApprovalPolicy)
    .insert({
      name: dto.name,
      secretPath: dto.secretPath,
      approvals: 1,
      envId: env.id,
      enforcementLevel: EnforcementLevel.Hard,
      bypassForMachineIdentities: false
    })
    .returning("*");
  await db(TableName.SecretApprovalPolicyEnvironment).insert({ policyId: policy.id, envId: env.id });
  await db(TableName.SecretApprovalPolicyApprover).insert({ policyId: policy.id, approverUserId: dto.approverUserId });
  return policy;
};
