import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TScepEnrollmentConfigDALFactory = ReturnType<typeof scepEnrollmentConfigDALFactory>;

export const scepEnrollmentConfigDALFactory = (db: TDbClient) => {
  const scepEnrollmentConfigOrm = ormify(db, TableName.PkiScepEnrollmentConfig);

  return scepEnrollmentConfigOrm;
};
