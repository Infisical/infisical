import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TSshCertificateAuthoritySecretDALFactory = ReturnType<typeof sshCertificateAuthoritySecretDALFactory>;

export const sshCertificateAuthoritySecretDALFactory = (db: TDbClient) => {
  const sshCaSecretOrm = ormify(db, TableName.SshCertificateAuthoritySecret);
  return sshCaSecretOrm;
};
