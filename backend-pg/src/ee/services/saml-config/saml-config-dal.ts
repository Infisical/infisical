import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSamlConfigDalFactory = ReturnType<typeof samlConfigDalFactory>;

export const samlConfigDalFactory = (db: TDbClient) => {
  const samlCfgOrm = ormify(db, TableName.SamlConfig);
  return samlCfgOrm;
};
