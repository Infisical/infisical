import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TCertificateAuthoritySecret } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { CertKeySource } from "@app/services/signer/signer-enums";

export type TCertificateAuthoritySecretDALFactory = ReturnType<typeof certificateAuthoritySecretDALFactory>;

export const certificateAuthoritySecretDALFactory = (db: TDbClient) => {
  const caSecretOrm = ormify(db, TableName.CertificateAuthoritySecret);

  const findExternallyKeyedByProjectId = async (projectId: string, tx?: Knex): Promise<TCertificateAuthoritySecret[]> =>
    (tx || db.replicaNode())(TableName.CertificateAuthoritySecret)
      .join(
        TableName.CertificateAuthority,
        `${TableName.CertificateAuthority}.id`,
        `${TableName.CertificateAuthoritySecret}.caId`
      )
      .where(`${TableName.CertificateAuthority}.projectId`, projectId)
      .whereNot(`${TableName.CertificateAuthoritySecret}.keySource`, CertKeySource.Infisical)
      .select(selectAllTableCols(TableName.CertificateAuthoritySecret));

  const primaryNode = () => db.primaryNode();

  return { ...caSecretOrm, findExternallyKeyedByProjectId, primaryNode };
};
