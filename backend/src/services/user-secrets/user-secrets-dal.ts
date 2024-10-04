import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { CreateSecretDALParamsType, GetSecretReturnType } from "./user-secrets-types";

export type TUserSecretsDALFactory = ReturnType<typeof userSecretsDALFactory>;

export const userSecretsDALFactory = (db: TDbClient) => {
  const userSecretCredentialsOrm = ormify(db, TableName.UserSecretCredentials);

  const createSecret = async (data: CreateSecretDALParamsType) => {
    try {
      let orgSecrets = await db(TableName.UserSecrets).where({ orgId: data.orgId }).first().select("id");
      if (!orgSecrets?.id) {
        orgSecrets = await db(TableName.UserSecrets).insert({ orgId: data.orgId }).returning("id");
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

  const getSecrets = async (orgId: string): Promise<GetSecretReturnType[] | void> => {
    try {
      const secrets = await db(TableName.UserSecrets)
        .where({ orgId })
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

  return {
    createSecret,
    getSecrets
  };
};
