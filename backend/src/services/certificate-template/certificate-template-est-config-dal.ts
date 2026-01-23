import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TCertificateTemplateEstConfigDALFactory = ReturnType<typeof certificateTemplateEstConfigDALFactory>;

export const certificateTemplateEstConfigDALFactory = (db: TDbClient) => {
  const certificateTemplateEstConfigOrm = ormify(db, TableName.CertificateTemplateEstConfig);

  return certificateTemplateEstConfigOrm;
};
