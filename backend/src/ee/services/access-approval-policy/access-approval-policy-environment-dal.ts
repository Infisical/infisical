import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAccessApprovalPolicyEnvironmentDALFactory = ReturnType<typeof accessApprovalPolicyEnvironmentDALFactory>;

export const accessApprovalPolicyEnvironmentDALFactory = (db: TDbClient) => {
  const accessApprovalPolicyEnvironmentOrm = ormify(db, TableName.AccessApprovalPolicyEnvironment);

  const findAvailablePoliciesIds = async (envId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.AccessApprovalPolicyEnvironment)
        .join(
          TableName.AccessApprovalPolicy,
          `${TableName.AccessApprovalPolicyEnvironment}.policyId`,
          `${TableName.AccessApprovalPolicy}.id`
        )
        .where({ [`${TableName.AccessApprovalPolicyEnvironment}.envId` as "envId"]: envId })
        .whereNull(`${TableName.AccessApprovalPolicy}.deletedAt`)
        .select(selectAllTableCols(TableName.AccessApprovalPolicyEnvironment));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "findAvailablePoliciesIds" });
    }
  };

  return { ...accessApprovalPolicyEnvironmentOrm, findAvailablePoliciesIds };
};
