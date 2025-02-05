import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TKmipInstanceServerCertificateDALFactory = ReturnType<typeof kmipInstanceServerCertificateDALFactory>;

export const kmipInstanceServerCertificateDALFactory = (db: TDbClient) => {
  const kmipInstanceServerCertificateOrm = ormify(db, TableName.KmipInstanceServerCertificates);

  return {
    ...kmipInstanceServerCertificateOrm
  };
};
