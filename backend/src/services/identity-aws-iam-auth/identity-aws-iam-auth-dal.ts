import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityAwsIamAuthDALFactory = ReturnType<typeof identityAwsIamAuthDALFactory>;

export const identityAwsIamAuthDALFactory = (db: TDbClient) => {
  const awsIamAuthOrm = ormify(db, TableName.IdentityAwsIamAuth);

  return awsIamAuthOrm;
};
