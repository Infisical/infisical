import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { TProxiedServiceCredentials } from "@app/db/schemas/proxied-service-credentials";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TProxiedServiceCredentialDALFactory = ReturnType<typeof proxiedServiceCredentialDALFactory>;

// Credentials store envId, but the API speaks environment slugs, so every read resolves the slug here
// rather than leaving each caller to join. A soft-deleted environment is excluded: the row survives its
// environment's deletion, and brokering a credential out of an environment mid-cleanup would be wrong.
export type TProxiedServiceCredentialWithEnv = TProxiedServiceCredentials & { environment: string };

export const proxiedServiceCredentialDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ProxiedServiceCredential);

  const findByServiceIds = async (serviceIds: string[], tx?: Knex): Promise<TProxiedServiceCredentialWithEnv[]> => {
    if (!serviceIds.length) return [];
    return (tx || db.replicaNode())(TableName.ProxiedServiceCredential)
      .whereIn(`${TableName.ProxiedServiceCredential}.serviceId`, serviceIds)
      .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.ProxiedServiceCredential}.envId`)
      .whereNull(`${TableName.Environment}.deleteAfter`)
      .select(selectAllTableCols(TableName.ProxiedServiceCredential))
      .select(db.ref("slug").withSchema(TableName.Environment).as("environment"));
  };

  const findByIds = async (ids: string[], tx?: Knex): Promise<TProxiedServiceCredentialWithEnv[]> => {
    if (!ids.length) return [];
    return (tx || db.replicaNode())(TableName.ProxiedServiceCredential)
      .whereIn(`${TableName.ProxiedServiceCredential}.id`, ids)
      .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.ProxiedServiceCredential}.envId`)
      .select(selectAllTableCols(TableName.ProxiedServiceCredential))
      .select(db.ref("slug").withSchema(TableName.Environment).as("environment"));
  };

  const deleteByServiceId = async (serviceId: string, tx?: Knex) => {
    await (tx || db)(TableName.ProxiedServiceCredential).where({ serviceId }).delete();
  };

  return {
    ...orm,
    findByServiceIds,
    findByIds,
    deleteByServiceId
  };
};
