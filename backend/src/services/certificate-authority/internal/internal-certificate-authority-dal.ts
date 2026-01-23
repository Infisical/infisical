import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TInternalCertificateAuthorityDALFactory = ReturnType<typeof internalCertificateAuthorityDALFactory>;

export const internalCertificateAuthorityDALFactory = (db: TDbClient) => {
  const caOrm = ormify(db, TableName.InternalCertificateAuthority);

  return {
    ...caOrm
  };
};
