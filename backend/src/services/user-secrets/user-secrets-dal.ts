import { TDbClient } from "@app/db";
import { TableName, TUserSecretCredentialsInsert, TUserSecretsInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TUserSecretsDALFactory = ReturnType<typeof userSecretsDALFactory>;

export const userSecretsDALFactory = (db: TDbClient) => {
  const userSecretsOrm = ormify(db, TableName.UserSecrets);
  const userSecretCredentialsOrm = ormify(db, TableName.UserSecretCredentials);

  const createSecret = async (orgData: TUserSecretsInsert, data: TUserSecretCredentialsInsert) => {
    try {
      let orgSecret = await userSecretsOrm.find({ orgId: orgData.orgId });
      if (!orgSecret) {
        orgSecret = await userSecretsOrm.insertMany([{ ...orgData }]);
      }

      const { id } = orgSecret[0];
      await userSecretCredentialsOrm.insertMany([{ ...data, secretId: id }]);
    } catch (error) {
      throw new DatabaseError({ error, message: "Error creating secret" });
    }
  };

  return {
    createSecret
  };
};
