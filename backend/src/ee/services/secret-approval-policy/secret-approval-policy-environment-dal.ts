import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretApprovalPolicyEnvironmentDALFactory = ReturnType<typeof secretApprovalPolicyEnvironmentDALFactory>;

export const secretApprovalPolicyEnvironmentDALFactory = (db: TDbClient) => {
  const secretApprovalPolicyEnvironmentOrm = ormify(db, TableName.SecretApprovalPolicyEnvironment);

  const findAvailablePoliciesByEnvId = async (envId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretApprovalPolicyEnvironment)
        .join(
          TableName.SecretApprovalPolicy,
          `${TableName.SecretApprovalPolicyEnvironment}.policyId`,
          `${TableName.SecretApprovalPolicy}.id`
        )
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ envId }, TableName.SecretApprovalPolicyEnvironment))
        .whereNull(`${TableName.SecretApprovalPolicy}.deletedAt`)
        .select(selectAllTableCols(TableName.SecretApprovalPolicyEnvironment));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "findAvailablePoliciesByEnvId" });
    }
  };

  return { ...secretApprovalPolicyEnvironmentOrm, findAvailablePoliciesByEnvId };
};
