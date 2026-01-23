import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TCertificateSecretDALFactory = ReturnType<typeof certificateSecretDALFactory>;

export const certificateSecretDALFactory = (db: TDbClient) => {
  const certSecretOrm = ormify(db, TableName.CertificateSecret);
  return certSecretOrm;
};
