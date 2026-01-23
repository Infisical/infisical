import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify, TOrmify } from "@app/lib/knex";

export type TCertificateAuthorityCrlDALFactory = TOrmify<TableName.CertificateAuthorityCrl>;

export const certificateAuthorityCrlDALFactory = (db: TDbClient): TCertificateAuthorityCrlDALFactory => {
  const caCrlOrm = ormify(db, TableName.CertificateAuthorityCrl);
  return caCrlOrm;
};
