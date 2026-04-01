import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSecretValidationRuleDALFactory = ReturnType<typeof secretValidationRuleDALFactory>;

export const secretValidationRuleDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.SecretValidationRule);

  return orm;
};
