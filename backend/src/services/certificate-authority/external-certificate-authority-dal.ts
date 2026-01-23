import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TExternalCertificateAuthorityDALFactory = ReturnType<typeof externalCertificateAuthorityDALFactory>;

export const externalCertificateAuthorityDALFactory = (db: TDbClient) => {
  const caOrm = ormify(db, TableName.ExternalCertificateAuthority);

  return {
    ...caOrm
  };
};
