import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TDelegatedApprovalCallbackDALFactory = ReturnType<typeof delegatedApprovalCallbackDALFactory>;

export const delegatedApprovalCallbackDALFactory = (db: TDbClient) => ormify(db, TableName.DelegatedApprovalRequests);
