import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSecretApprovalPolicyApproverDALFactory = ReturnType<typeof secretApprovalPolicyApproverDALFactory>;

export const secretApprovalPolicyApproverDALFactory = (db: TDbClient) => {
  const sapApproverOrm = ormify(db, TableName.SecretApprovalPolicyApprover);
  return sapApproverOrm;
};
