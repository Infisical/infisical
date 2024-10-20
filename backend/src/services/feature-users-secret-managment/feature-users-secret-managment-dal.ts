import { TDbClient } from "@app/db";
import { TableName, TUserSecretsInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex"; // Adjust the import path based on your project structure

export type TFeatureUsersSecretManagementDALFactory = ReturnType<typeof featureUsersSecretManagmentDALFactory>;

export const featureUsersSecretManagmentDALFactory = (db: TDbClient) => {
  const userSecretOrm = ormify(db, TableName.UserSecrets);

  const createUserSecret = async (secretData: TUserSecretsInsert) => {
    return userSecretOrm.create({
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

  const countAllUserSecrets = async ({ organization_id, user_id }: { organization_id: string; user_id: string }) => {
    try {
      interface CountResult {
        count: string;
      }

      const count = await db
        .replicaNode()(TableName.UserSecrets)
        .where(`${TableName.UserSecrets}.organization_id`, organization_id)
        .where(`${TableName.UserSecrets}.user_id`, user_id)
        .count("*")
        .first();

      return parseInt((count as unknown as CountResult).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count all user-org shared secrets" });
    }
  };
  return {
    ...userSecretOrm,
    createUserSecret,
    countAllUserSecrets
  };
};
