import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TKmipClientCertificateDALFactory = ReturnType<typeof kmipClientCertificateDALFactory>;

export const kmipClientCertificateDALFactory = (db: TDbClient) => {
  const kmipClientCertOrm = ormify(db, TableName.KmipClientCertificates);

  return kmipClientCertOrm;
};
