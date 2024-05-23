import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TCertificateAuthorityDALFactory = ReturnType<typeof certificateAuthorityDALFactory>;

export const certificateAuthorityDALFactory = (db: TDbClient) => {
  const caOrm = ormify(db, TableName.CertificateAuthority);
  return caOrm;
};
