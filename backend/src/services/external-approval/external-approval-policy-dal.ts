import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TExternalApprovalPolicyDALFactory = ReturnType<typeof externalApprovalPolicyDALFactory>;

export const externalApprovalPolicyDALFactory = (db: TDbClient) => ormify(db, TableName.ExternalApprovalPolicies);
