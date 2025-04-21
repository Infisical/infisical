import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSamlConfigDALFactory = ReturnType<typeof samlConfigDALFactory>;

export const samlConfigDALFactory = (db: TDbClient) => {
  const samlCfgOrm = ormify(db, TableName.SamlConfig);

  return samlCfgOrm;
};
