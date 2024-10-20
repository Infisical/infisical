import { TDbClient } from "@app/db";
import { TableName, TUserSecretsInsert } from "@app/db/schemas";
import { ormify } from "@app/lib/knex"; // Adjust the import path based on your project structure

export type TFeatureUsersSecretManagementDALFactory = ReturnType<typeof featureUsersSecretManagmentDALFactory>;

export const featureUsersSecretManagmentDALFactory = (db: TDbClient) => {
  const userSecretsDAL = ormify(db, TableName.UserSecrets);

  const createUserSecret = async (secretData: TUserSecretsInsert) => {
    return userSecretsDAL.create({
      user_id: secretData.user_id,
      organization_id: secretData.organization_id,
      type: secretData.type,
      username: secretData.username,
      password: secretData.password,
      card_number: secretData.card_number,
      expiry_date: secretData.expiry_date,
      cvv: secretData.cvv,
      title: secretData.title,
      content: secretData.content
    });
  };

  return {
    ...userSecretsDAL,
    createUserSecret
  };
};
