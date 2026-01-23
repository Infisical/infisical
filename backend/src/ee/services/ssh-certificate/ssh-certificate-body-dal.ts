import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TSshCertificateBodyDALFactory = ReturnType<typeof sshCertificateBodyDALFactory>;

export const sshCertificateBodyDALFactory = (db: TDbClient) => {
  const sshCertificateBodyOrm = ormify(db, TableName.SshCertificateBody);
  return sshCertificateBodyOrm;
};
