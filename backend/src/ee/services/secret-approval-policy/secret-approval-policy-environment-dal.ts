import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretApprovalPolicyEnvironmentDALFactory = ReturnType<typeof secretApprovalPolicyEnvironmentDALFactory>;

export const secretApprovalPolicyEnvironmentDALFactory = (db: TDbClient) => {
  const secretApprovalPolicyEnvironmentOrm = ormify(db, TableName.SecretApprovalPolicyEnvironment);

  const findAvailablePoliciesIds = async (envId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretApprovalPolicyEnvironment)
        .join(
          TableName.SecretApprovalPolicy,
          `${TableName.SecretApprovalPolicyEnvironment}.policyId`,
          `${TableName.SecretApprovalPolicy}.id`
        )
        .where({ [`${TableName.SecretApprovalPolicyEnvironment}.envId` as "envId"]: envId })
        .whereNull(`${TableName.SecretApprovalPolicy}.deletedAt`)
        .select(selectAllTableCols(TableName.SecretApprovalPolicyEnvironment));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "findAvailablePoliciesIds" });
    }
  };

  return { ...secretApprovalPolicyEnvironmentOrm, findAvailablePoliciesIds };
};
