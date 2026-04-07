import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TEmailDomainDALFactory = ReturnType<typeof emailDomainDALFactory>;

export const emailDomainDALFactory = (db: TDbClient) => {
  const emailDomainOrm = ormify(db, TableName.EmailDomains);

  return emailDomainOrm;
};
