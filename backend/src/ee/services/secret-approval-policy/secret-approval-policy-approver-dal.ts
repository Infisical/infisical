import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TSecretApprovalPolicyApproverDALFactory = ReturnType<typeof secretApprovalPolicyApproverDALFactory>;

export const secretApprovalPolicyApproverDALFactory = (db: TDbClient) => {
  const sapApproverOrm = ormify(db, TableName.SecretApprovalPolicyApprover);
  return sapApproverOrm;
};

export type TSecretApprovalPolicyBypasserDALFactory = ReturnType<typeof secretApprovalPolicyBypasserDALFactory>;

export const secretApprovalPolicyBypasserDALFactory = (db: TDbClient) => {
  const sapBypasserOrm = ormify(db, TableName.SecretApprovalPolicyBypasser);
  return sapBypasserOrm;
};
