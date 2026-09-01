import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { TProxiedServiceCredentials } from "@app/db/schemas/proxied-service-credentials";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TProxiedServiceCredentialDALFactory = ReturnType<typeof proxiedServiceCredentialDALFactory>;

export const proxiedServiceCredentialDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ProxiedServiceCredential);

  const findByServiceIds = async (serviceIds: string[], tx?: Knex): Promise<TProxiedServiceCredentials[]> => {
    if (!serviceIds.length) return [];
    return (tx || db.replicaNode())(TableName.ProxiedServiceCredential)
      .whereIn("serviceId", serviceIds)
      .select(selectAllTableCols(TableName.ProxiedServiceCredential));
  };

  const deleteByServiceId = async (serviceId: string, tx?: Knex) => {
    await (tx || db)(TableName.ProxiedServiceCredential).where({ serviceId }).delete();
  };

  return {
    ...orm,
    findByServiceIds,
    deleteByServiceId
  };
};
