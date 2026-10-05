import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { ApprovalPoliciesSchema, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";

export type TApprovalPolicySecretEnvironmentDALFactory = ReturnType<typeof approvalPolicySecretEnvironmentDALFactory>;

export const approvalPolicySecretEnvironmentDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalPolicySecretEnvironment);

  const findPolicyByEnvIdAndSecretPath = async (
    { envIds, secretPath }: { envIds: string[]; secretPath: string },
    tx?: Knex
  ) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.ApprovalPolicies)
        .join(
          TableName.ApprovalPolicySecretEnvironment,
          `${TableName.ApprovalPolicySecretEnvironment}.policyId`,
          `${TableName.ApprovalPolicies}.id`
        )
        .join(TableName.Environment, function joinActiveEnvForSecretChangePolicy() {
          this.on(`${TableName.ApprovalPolicySecretEnvironment}.envId`, `${TableName.Environment}.id`).andOnNull(
            `${TableName.Environment}.deleteAfter`
          );
        })
        .where(`${TableName.ApprovalPolicies}.type`, ApprovalPolicyType.SecretChange)
        .whereIn(`${TableName.ApprovalPolicySecretEnvironment}.envId`, envIds)
        .where(`${TableName.ApprovalPolicySecretEnvironment}.secretPath`, secretPath)
        .select(selectAllTableCols(TableName.ApprovalPolicies))
        .select(db.ref("name").withSchema(TableName.Environment).as("envName"))
        .select(db.ref("slug").withSchema(TableName.Environment).as("envSlug"))
        .select(db.ref("id").withSchema(TableName.Environment).as("environmentId"));

      const formattedDocs = sqlNestRelationships({
        data: docs,
        key: "id",
        parentMapper: (data) => ApprovalPoliciesSchema.parse(data),
        childrenMapper: [
          {
            key: "environmentId",
            label: "environments" as const,
            mapper: ({ environmentId: id, envName, envSlug }) => ({
              id,
              name: envName,
              slug: envSlug
            })
          }
        ]
      });
      return formattedDocs?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "findPolicyByEnvIdAndSecretPath" });
    }
  };

  const findEnvironmentsByPolicyId = async (policyId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.ApprovalPolicySecretEnvironment)
        .join(TableName.Environment, function joinActiveEnvForSecretChangePolicy() {
          this.on(`${TableName.ApprovalPolicySecretEnvironment}.envId`, `${TableName.Environment}.id`).andOnNull(
            `${TableName.Environment}.deleteAfter`
          );
        })
        .where(`${TableName.ApprovalPolicySecretEnvironment}.policyId`, policyId)
        .select(db.ref("id").withSchema(TableName.Environment))
        .select(db.ref("name").withSchema(TableName.Environment))
        .select(db.ref("slug").withSchema(TableName.Environment))
        .select(db.ref("secretPath").withSchema(TableName.ApprovalPolicySecretEnvironment))
        .orderBy(`${TableName.Environment}.position`, "asc");

      return docs as { id: string; name: string; slug: string; secretPath: string }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "findEnvironmentsByPolicyId" });
    }
  };

  return { ...orm, findPolicyByEnvIdAndSecretPath, findEnvironmentsByPolicyId };
};
