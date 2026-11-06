import { Knex } from "knex";

import { TableName } from "@app/db/schemas";
import { ApproverType } from "@app/ee/services/access-approval-policy/access-approval-policy-types";
import { EnforcementLevel } from "@app/lib/types";

import { request } from "./request";

// The API puts every new policy on a V3 project on the global approval system, so a policy on the legacy
// approval system can only be seeded directly.
export const seedLegacySecretApprovalPolicy = async (
  db: Knex,
  dto: { projectId: string; environment: string; secretPath: string; name: string; approverUserId: string; id?: string }
) => {
  const env = await db(TableName.Environment).where({ projectId: dto.projectId, slug: dto.environment }).first();
  if (!env) throw new Error(`environment '${dto.environment}' not found in project ${dto.projectId}`);

  const [policy] = await db(TableName.SecretApprovalPolicy)
    .insert({
      ...(dto.id ? { id: dto.id } : {}),
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

// Reviewers that must sign off before a secret change in a path takes effect. One user approver and
// one required approval is enough to make a write wait on a request.
export const createSecretApprovalPolicy = (dto: {
  projectId: string;
  environmentSlug: string;
  secretPath: string;
  approverUserIds: string[];
  authToken: string;
}) =>
  request(
    {
      method: "POST",
      url: "/api/v1/secret-approvals",
      headers: { authorization: `Bearer ${dto.authToken}` },
      body: {
        workspaceId: dto.projectId,
        environment: dto.environmentSlug,
        name: `policy${dto.secretPath.replaceAll("/", "-")}`,
        secretPath: dto.secretPath,
        approvers: dto.approverUserIds.map((id) => ({ type: ApproverType.User, id })),
        approvals: 1
      }
    },
    (res) => {
      expect(res.statusCode).toBe(200);
      return res.json<{ approval: { id: string } }>().approval;
    }
  );
