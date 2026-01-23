import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TCertificateBodyDALFactory = ReturnType<typeof certificateBodyDALFactory>;

export const certificateBodyDALFactory = (db: TDbClient) => {
  const certificateBodyOrm = ormify(db, TableName.CertificateBody);
  return certificateBodyOrm;
};
