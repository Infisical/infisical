import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSecretApprovalPolicyGroupApproverDALFactory = ReturnType<
  typeof secretApprovalPolicyGroupApproverDALFactory
>;

export const secretApprovalPolicyGroupApproverDALFactory = (db: TDbClient) => {
  const sapGroupApproverOrm = ormify(db, TableName.SecretApprovalPolicyGroupApprover);
  return sapGroupApproverOrm;
};
