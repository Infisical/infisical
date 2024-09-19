import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAccessApprovalPolicyGroupApproverDALFactory = ReturnType<
  typeof accessApprovalPolicyGroupApproverDALFactory
>;

export const accessApprovalPolicyGroupApproverDALFactory = (db: TDbClient) => {
  const accessApprovalPolicyGroupApproverOrm = ormify(db, TableName.AccessApprovalPolicyGroupApprover);
  return { ...accessApprovalPolicyGroupApproverOrm };
};
