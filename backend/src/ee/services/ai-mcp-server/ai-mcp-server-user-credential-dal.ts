import { TDbClient } from "@app/db";
import { TableName, TAiMcpServerUserCredentialsInsert } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TAiMcpServerUserCredentialDALFactory = ReturnType<typeof aiMcpServerUserCredentialDALFactory>;

export const aiMcpServerUserCredentialDALFactory = (db: TDbClient) => {
  const aiMcpServerUserCredentialOrm = ormify(db, TableName.AiMcpServerUserCredential);

  const findByUserAndServer = async (userId: string, aiMcpServerId: string) => {
    return aiMcpServerUserCredentialOrm.findOne({ userId, aiMcpServerId });
  };

  const upsertCredential = async (data: TAiMcpServerUserCredentialsInsert) => {
    const [result] = await aiMcpServerUserCredentialOrm.upsert([data], ["userId", "aiMcpServerId"], undefined, [
      "encryptedCredentials"
    ]);
    return result;
  };

  return {
    ...aiMcpServerUserCredentialOrm,
    findByUserAndServer,
    upsertCredential
  };
};
