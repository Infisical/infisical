import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TOidcConfigDALFactory = ReturnType<typeof oidcConfigDALFactory>;

export const oidcConfigDALFactory = (db: TDbClient) => {
  const oidcCfgOrm = ormify(db, TableName.OidcConfig);

  return oidcCfgOrm;
};
