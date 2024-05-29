import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TCertificateCertDALFactory = ReturnType<typeof certificateCertDALFactory>;

export const certificateCertDALFactory = (db: TDbClient) => {
  const certificateCertOrm = ormify(db, TableName.CertificateCert);
  return certificateCertOrm;
};
