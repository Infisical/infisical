import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TDynamicSecretUserCredentials, TDynamicSecretUserCredentialsUpdate } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, TOrmify } from "@app/lib/knex";

import { DynamicSecretUserCredentialStatus } from "./dynamic-secret-user-credential-types";

export interface TDynamicSecretUserCredentialDALFactory extends TOrmify<TableName.DynamicSecretUserCredential> {
  findByExternalUserId: (
    dynamicSecretId: string,
    externalUserId: string,
    tx?: Knex
  ) => Promise<TDynamicSecretUserCredentials | undefined>;
  upsertCredentials: (
    data: Pick<
      TDynamicSecretUserCredentials,
      "dynamicSecretId" | "externalUserId" | "encryptedCredentials" | "accessTokenExpiresAt"
    >,
    tx?: Knex
  ) => Promise<TDynamicSecretUserCredentials>;
  updateIfVersion: (
    id: string,
    expectedVersion: number,
    data: Omit<TDynamicSecretUserCredentialsUpdate, "version">,
    tx?: Knex
  ) => Promise<TDynamicSecretUserCredentials | undefined>;
  listByDynamicSecretId: (
    dynamicSecretId: string,
    pagination: { offset: number; limit: number },
    tx?: Knex
  ) => Promise<{ userCredentials: TDynamicSecretUserCredentials[]; totalCount: number }>;
}

export const dynamicSecretUserCredentialDALFactory = (db: TDbClient): TDynamicSecretUserCredentialDALFactory => {
  const orm = ormify(db, TableName.DynamicSecretUserCredential);

  // Reads the primary: a replica can lag behind a refresh, and a refresh token read from it may already have been
  // rotated away by the authorization server.
  const findByExternalUserId: TDynamicSecretUserCredentialDALFactory["findByExternalUserId"] = async (
    dynamicSecretId,
    externalUserId,
    tx
  ) => {
    try {
      return await (tx || db)(TableName.DynamicSecretUserCredential).where({ dynamicSecretId, externalUserId }).first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find dynamic secret user credential by external user ID" });
    }
  };

  const upsertCredentials: TDynamicSecretUserCredentialDALFactory["upsertCredentials"] = async (data, tx) => {
    try {
      const [userCredential] = await (tx || db)(TableName.DynamicSecretUserCredential)
        .insert({ ...data, status: DynamicSecretUserCredentialStatus.Active, version: 1 })
        .onConflict(["dynamicSecretId", "externalUserId"])
        .merge({
          encryptedCredentials: data.encryptedCredentials,
          accessTokenExpiresAt: data.accessTokenExpiresAt,
          status: DynamicSecretUserCredentialStatus.Active,
          statusDetails: null,
          lastRefreshedAt: null,
          version: db.raw(`"${TableName.DynamicSecretUserCredential}"."version" + 1`)
        })
        .returning("*");
      return userCredential;
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert dynamic secret user credential" });
    }
  };

  // Compare-and-set on version, so a refresh that finishes after the application stored new tokens can't
  // overwrite them.
  const updateIfVersion: TDynamicSecretUserCredentialDALFactory["updateIfVersion"] = async (
    id,
    expectedVersion,
    data,
    tx
  ) => {
    const [userCredential] = await orm.update({ id, version: expectedVersion }, { ...data, $incr: { version: 1 } }, tx);
    return userCredential;
  };

  const listByDynamicSecretId: TDynamicSecretUserCredentialDALFactory["listByDynamicSecretId"] = async (
    dynamicSecretId,
    { offset, limit },
    tx
  ) => {
    try {
      const query = (tx || db.replicaNode())(TableName.DynamicSecretUserCredential).where({ dynamicSecretId });
      const [userCredentials, countResult] = await Promise.all([
        query.clone().orderBy("externalUserId", "asc").offset(offset).limit(limit),
        query.clone().count("* as count").first()
      ]);
      return {
        userCredentials,
        totalCount: parseInt(String((countResult as { count?: string | number } | undefined)?.count ?? "0"), 10)
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "List dynamic secret user credentials" });
    }
  };

  return {
    ...orm,
    findByExternalUserId,
    upsertCredentials,
    updateIfVersion,
    listByDynamicSecretId
  };
};
