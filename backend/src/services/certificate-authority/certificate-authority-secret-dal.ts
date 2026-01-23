import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TCertificateAuthoritySecretDALFactory = ReturnType<typeof certificateAuthoritySecretDALFactory>;

export const certificateAuthoritySecretDALFactory = (db: TDbClient) => {
  const caSecretOrm = ormify(db, TableName.CertificateAuthoritySecret);
  return caSecretOrm;
};
