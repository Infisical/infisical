import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";

export type TConsumerSecretsDALFactory = ReturnType<typeof consumerSecretsDALFactory>;

export const consumerSecretsDALFactory = (db: TDbClient) => {

  return {  };
};
