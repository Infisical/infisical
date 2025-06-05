import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAccessApprovalPolicyApproverDALFactory = ReturnType<typeof accessApprovalPolicyApproverDALFactory>;

export const accessApprovalPolicyApproverDALFactory = (db: TDbClient) => {
  const accessApprovalPolicyApproverOrm = ormify(db, TableName.AccessApprovalPolicyApprover);
  return { ...accessApprovalPolicyApproverOrm };
};

export type TAccessApprovalPolicyBypasserDALFactory = ReturnType<typeof accessApprovalPolicyBypasserDALFactory>;

export const accessApprovalPolicyBypasserDALFactory = (db: TDbClient) => {
  const accessApprovalPolicyBypasserOrm = ormify(db, TableName.AccessApprovalPolicyBypasser);
  return { ...accessApprovalPolicyBypasserOrm };
};
