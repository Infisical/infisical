import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TCertificateAuthorityCrlDALFactory = ReturnType<typeof certificateAuthorityCrlDALFactory>;

export const certificateAuthorityCrlDALFactory = (db: TDbClient) => {
  const caCrlOrm = ormify(db, TableName.CertificateAuthorityCrl);
  return caCrlOrm;
};
