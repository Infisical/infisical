import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSshCertificateAuthorityDALFactory = ReturnType<typeof sshCertificateAuthorityDALFactory>;

export const sshCertificateAuthorityDALFactory = (db: TDbClient) => {
  const sshCaOrm = ormify(db, TableName.SshCertificateAuthority);
  return sshCaOrm;
};
