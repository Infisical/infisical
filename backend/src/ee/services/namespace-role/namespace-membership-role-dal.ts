import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, TOrmify } from "@app/lib/knex";

export type TNamespaceMembershipRoleDALFactory = TOrmify<TableName.NamespaceMembershipRole>;

export const namespaceMembershipRoleDALFactory = (db: TDbClient) => ormify(db, TableName.NamespaceMembershipRole);
