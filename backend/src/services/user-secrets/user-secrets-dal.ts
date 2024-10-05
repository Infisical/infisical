import { TDbClient } from "@app/db";
import { TableName, TUserSecretCredentialsUpdate } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { CreateSecretDALParamsType, GetSecretReturnType } from "./user-secrets-types";

export type TUserSecretsDALFactory = ReturnType<typeof userSecretsDALFactory>;

export const userSecretsDALFactory = (db: TDbClient) => {
  const userSecretCredentialsOrm = ormify(db, TableName.UserSecretCredentials);

  const createSecret = async (data: CreateSecretDALParamsType) => {
    try {
      let orgSecrets = await db(TableName.UserSecrets)
        .where({ orgId: data.orgId, userId: data.userId })
        .first()
        .select("id");
      if (!orgSecrets?.id) {
        orgSecrets = await db(TableName.UserSecrets).insert({ orgId: data.orgId, userId: data.userId }).returning("id");
      }

      await userSecretCredentialsOrm.insertMany([
        {
          credentialType: data.credentialType,
          title: data.title,
          fields: data.fields,
          secretId: orgSecrets?.id as unknown as string,
          iv: data.iv,
          tag: data.tag
        }
      ]);
    } catch (error) {
      throw new DatabaseError({ error, message: "Error creating secret" });
    }
  };

  const getSecrets = async (orgId: string, userId: string): Promise<GetSecretReturnType[] | void> => {
    try {
      const secrets = await db(TableName.UserSecrets)
        .where({ orgId, userId })
        .join(
          TableName.UserSecretCredentials,
          `${TableName.UserSecrets}.id`,
          `${TableName.UserSecretCredentials}.secretId`
        )
        .select(`${TableName.UserSecrets}.*`, `${TableName.UserSecretCredentials}.*`);
      return secrets as GetSecretReturnType[];
    } catch (error) {
      throw new DatabaseError({ error, message: "Error getting secrets" });
    }
  };

  const updateSecrets = async (recordId: string, data: TUserSecretCredentialsUpdate) => {
    try {
      await db(TableName.UserSecretCredentials).update(data).where({ id: recordId });
    } catch (error) {
      throw new DatabaseError({ error, message: "Error updating secret" });
    }
  };

  const deleteSecret = async (recordId: string) => {
    try {
      await db(TableName.UserSecretCredentials).delete().where({ id: recordId });
    } catch (error) {
      throw new DatabaseError({ error, message: "Error deleting secret" });
    }
  };

  const getSecretByCredentialType = async (orgId: string, userId: string, credentialType: string) => {
    try {
      const secret = await db(TableName.UserSecrets)
        .where({ orgId, userId })
        .join(
          TableName.UserSecretCredentials,
          `${TableName.UserSecrets}.id`,
          `${TableName.UserSecretCredentials}.secretId`
        )
        .where({ credentialType })
        .select(`${TableName.UserSecrets}.*`, `${TableName.UserSecretCredentials}.*`);
      return secret as GetSecretReturnType[];
    } catch (error) {
      throw new DatabaseError({ error, message: "Error getting secret by validation type" });
    }
  };

  return {
    createSecret,
    getSecrets,
    updateSecrets,
    deleteSecret,
    getSecretByCredentialType
  };
};
