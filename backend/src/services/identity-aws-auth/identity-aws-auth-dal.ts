import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TIdentityAwsAuthDALFactory = ReturnType<typeof identityAwsAuthDALFactory>;

export const identityAwsAuthDALFactory = (db: TDbClient) => {
  const awsAuthOrm = ormify(db, TableName.IdentityAwsAuth);

  return awsAuthOrm;
};
