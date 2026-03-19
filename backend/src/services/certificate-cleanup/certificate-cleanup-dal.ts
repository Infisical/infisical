import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TCertificateCleanupConfigDALFactory = ReturnType<typeof certificateCleanupConfigDALFactory>;

export const certificateCleanupConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.CertificateCleanupConfig);

  return orm;
};
