import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityGcpIamAuthDALFactory = ReturnType<typeof identityGcpIamAuthDALFactory>;

export const identityGcpIamAuthDALFactory = (db: TDbClient) => {
  const gcpIamAuthOrm = ormify(db, TableName.IdentityGcpIamAuth);
  return gcpIamAuthOrm;
};
