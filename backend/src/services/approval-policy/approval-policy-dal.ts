import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

// Approval Policy
export type TApprovalPolicyDALFactory = ReturnType<typeof approvalPolicyDALFactory>;
export const approvalPolicyDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalPolicies);

  return {
    ...orm
  };
};

// Approval Policy Steps
export type TApprovalPolicyStepsDALFactory = ReturnType<typeof approvalPolicyStepsDALFactory>;
export const approvalPolicyStepsDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalPolicySteps);
  return orm;
};

// Approval Policy Step Approvers
export type TApprovalPolicyStepApproversDALFactory = ReturnType<typeof approvalPolicyStepApproversDALFactory>;
export const approvalPolicyStepApproversDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalPolicyStepApprovers);
  return orm;
};

// Approval Policy Grants
export type TApprovalRequestGrantsDALFactory = ReturnType<typeof approvalRequestGrantsDALFactory>;
export const approvalRequestGrantsDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ApprovalRequestGrants);
  return orm;
};
