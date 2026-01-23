import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify, TOrmify } from "@app/lib/knex";

export type TSamlConfigDALFactory = TOrmify<TableName.SamlConfig>;

export const samlConfigDALFactory = (db: TDbClient): TSamlConfigDALFactory => {
  const samlCfgOrm = ormify(db, TableName.SamlConfig);

  return samlCfgOrm;
};
