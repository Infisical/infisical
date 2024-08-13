import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TCertificateAuthorityEstConfigDALFactory = ReturnType<typeof certificateAuthorityEstConfigDALFactory>;

export const certificateAuthorityEstConfigDALFactory = (db: TDbClient) => {
  const caEstConfigOrm = ormify(db, TableName.CertificateAuthorityEstConfig);

  return caEstConfigOrm;
};
