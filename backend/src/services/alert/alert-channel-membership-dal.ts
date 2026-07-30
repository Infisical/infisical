import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAlertChannelMembershipDALFactory = ReturnType<typeof alertChannelMembershipDALFactory>;

export const alertChannelMembershipDALFactory = (db: TDbClient) => ormify(db, TableName.AlertChannelMembership);
