import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSecretChangeRequestDALFactory = ReturnType<typeof secretChangeRequestDALFactory>;

export const secretChangeRequestDALFactory = (db: TDbClient) => ormify(db, TableName.SecretChangeRequests);
