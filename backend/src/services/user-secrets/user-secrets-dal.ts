import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { UserSecretType } from "./user-secrets-types";

export type TUserSecretsDALFactory = ReturnType<typeof userSecretsDALFactory>;

export const userSecretsDALFactory = (db: TDbClient) => {
  const userSecretsOrm = ormify(db, TableName.UserSecrets);

  const countUserSecrets = async ({ secretType, userId }: { secretType?: UserSecretType; userId: string }) => {
    try {
      interface CountResult {
        count: string;
      }

      const count = await db
        .replicaNode()(TableName.UserSecrets)
        .where(`${TableName.UserSecrets}.userId`, userId)
        .where(`${TableName.UserSecrets}.secretType`, secretType)
        .count("*")
        .first();

      return parseInt((count as unknown as CountResult).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count all user secrets secrets" });
    }
  };

  return {
    ...userSecretsOrm,
    countUserSecrets
  };
};
