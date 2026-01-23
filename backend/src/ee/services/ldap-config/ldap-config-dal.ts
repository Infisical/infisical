import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TLdapConfigDALFactory = ReturnType<typeof ldapConfigDALFactory>;

export const ldapConfigDALFactory = (db: TDbClient) => {
  const ldapCfgOrm = ormify(db, TableName.LdapConfig);

  return { ...ldapCfgOrm };
};
