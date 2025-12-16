import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAcmeEnrollmentConfigDALFactory = ReturnType<typeof acmeEnrollmentConfigDALFactory>;

export const acmeEnrollmentConfigDALFactory = (db: TDbClient) => {
  const acmeEnrollmentConfigOrm = ormify(db, TableName.PkiAcmeEnrollmentConfig);

  return {
    ...acmeEnrollmentConfigOrm
  };
};
