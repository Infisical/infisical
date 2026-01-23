import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols } from "@app/lib/knex";

export type TAccessApprovalPolicyEnvironmentDALFactory = ReturnType<typeof accessApprovalPolicyEnvironmentDALFactory>;

export const accessApprovalPolicyEnvironmentDALFactory = (db: TDbClient) => {
  const accessApprovalPolicyEnvironmentOrm = ormify(db, TableName.AccessApprovalPolicyEnvironment);

  const findAvailablePoliciesByEnvId = async (envId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.AccessApprovalPolicyEnvironment)
        .join(
          TableName.AccessApprovalPolicy,
          `${TableName.AccessApprovalPolicyEnvironment}.policyId`,
          `${TableName.AccessApprovalPolicy}.id`
        )
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ envId }, TableName.AccessApprovalPolicyEnvironment))
        .whereNull(`${TableName.AccessApprovalPolicy}.deletedAt`)
        .select(selectAllTableCols(TableName.AccessApprovalPolicyEnvironment));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "findAvailablePoliciesByEnvId" });
    }
  };

  return { ...accessApprovalPolicyEnvironmentOrm, findAvailablePoliciesByEnvId };
};
