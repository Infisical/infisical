/* eslint-disable @typescript-eslint/no-unused-vars */
import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

import { type NewUserSecret } from "./user-secrets-types";

export type TUserSecretsDALFactory = ReturnType<typeof userSecretsDALFactory>;

export const userSecretsDALFactory = (db: TDbClient) => {
  // const userSecretsOrm = ormify(db, TableName.UserSecrets);

  const findByUserId = async (userId: string) => {
    // return await userSecretsOrm.find({
    //   userId
    // });
  };

  const create = async (userSecretData: NewUserSecret) => {
    // return await userSecretsOrm.create(userSecretData);
  };

  const update = async (userSecretId: string, userSecretData: NewUserSecret) => {
    // return await userSecretsOrm.updateById(userSecretId, userSecretData);
  };

  const del = async (userSecretId: string) => {
    // return await userSecretsOrm.delete({ id: userSecretId });
  };

  return { findByUserId, create, update, del };
};
