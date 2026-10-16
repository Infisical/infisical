import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TDelegatedApprovalPolicyDALFactory = ReturnType<typeof delegatedApprovalPolicyDALFactory>;

export const delegatedApprovalPolicyDALFactory = (db: TDbClient) => ormify(db, TableName.DelegatedApprovalPolicies);
