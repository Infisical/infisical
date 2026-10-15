import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TExternalApprovalRequestDALFactory = ReturnType<typeof externalApprovalRequestDALFactory>;

export const externalApprovalRequestDALFactory = (db: TDbClient) => ormify(db, TableName.ExternalApprovalRequests);
