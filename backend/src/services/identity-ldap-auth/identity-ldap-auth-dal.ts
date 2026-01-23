import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TIdentityLdapAuthDALFactory = ReturnType<typeof identityLdapAuthDALFactory>;

export const identityLdapAuthDALFactory = (db: TDbClient) => {
  const ldapAuthOrm = ormify(db, TableName.IdentityLdapAuth);

  return ldapAuthOrm;
};
