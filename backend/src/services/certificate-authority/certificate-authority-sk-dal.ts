import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TCertificateAuthoritySkDALFactory = ReturnType<typeof certificateAuthoritySkDALFactory>;

export const certificateAuthoritySkDALFactory = (db: TDbClient) => {
  const caSkOrm = ormify(db, TableName.CertificateAuthoritySk);
  return caSkOrm;
};
