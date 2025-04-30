import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TCertificateSecretDALFactory = ReturnType<typeof certificateSecretDALFactory>;

export const certificateSecretDALFactory = (db: TDbClient) => {
  const caSecretOrm = ormify(db, TableName.CertificateSecret);
  return caSecretOrm;
};
