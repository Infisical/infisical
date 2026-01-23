import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TCertificateAuthorityCertDALFactory = ReturnType<typeof certificateAuthorityCertDALFactory>;

export const certificateAuthorityCertDALFactory = (db: TDbClient) => {
  const caCertOrm = ormify(db, TableName.CertificateAuthorityCert);
  return caCertOrm;
};
