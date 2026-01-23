import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TIdentityKubernetesAuthDALFactory = ReturnType<typeof identityKubernetesAuthDALFactory>;

export const identityKubernetesAuthDALFactory = (db: TDbClient) => {
  const kubernetesAuthOrm = ormify(db, TableName.IdentityKubernetesAuth);
  return kubernetesAuthOrm;
};
