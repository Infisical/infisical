import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TDelegatedApprovalRequestDALFactory = ReturnType<typeof delegatedApprovalRequestDALFactory>;

export const delegatedApprovalRequestDALFactory = (db: TDbClient) => ormify(db, TableName.DelegatedApprovalRequests);
