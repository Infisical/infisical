import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TLdapGroupMapDALFactory = ReturnType<typeof ldapGroupMapDALFactory>;

export const ldapGroupMapDALFactory = (db: TDbClient) => {
  const ldapGroupMapOrm = ormify(db, TableName.LdapGroupMap);

  return { ...ldapGroupMapOrm };
};
