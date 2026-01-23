import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TKmipOrgServerCertificateDALFactory = ReturnType<typeof kmipOrgServerCertificateDALFactory>;

export const kmipOrgServerCertificateDALFactory = (db: TDbClient) => {
  const kmipOrgServerCertificateOrm = ormify(db, TableName.KmipOrgServerCertificates);

  return kmipOrgServerCertificateOrm;
};
