import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify, TOrmify } from "@app/lib/knex";

export type TAccessApprovalPolicyApproverDALFactory = TOrmify<TableName.AccessApprovalPolicyApprover>;

export const accessApprovalPolicyApproverDALFactory = (db: TDbClient) => {
  const accessApprovalPolicyApproverOrm = ormify(db, TableName.AccessApprovalPolicyApprover);
  return { ...accessApprovalPolicyApproverOrm };
};

export type TAccessApprovalPolicyBypasserDALFactory = TOrmify<TableName.AccessApprovalPolicyBypasser>;

export const accessApprovalPolicyBypasserDALFactory = (db: TDbClient) => {
  const accessApprovalPolicyBypasserOrm = ormify(db, TableName.AccessApprovalPolicyBypasser);
  return { ...accessApprovalPolicyBypasserOrm };
};
