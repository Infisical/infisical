import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TResourceKubernetesAuthDALFactory = ReturnType<typeof resourceKubernetesAuthDALFactory>;

export const resourceKubernetesAuthDALFactory = (db: TDbClient) => {
  return ormify(db, TableName.ResourceKubernetesAuth);
};
