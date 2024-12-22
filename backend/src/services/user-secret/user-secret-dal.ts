import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TUserSecrets } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TUserSecretDALFactory = ReturnType<typeof userSecretDALFactory>;

export const userSecretDALFactory = (db: TDbClient) => {
  const userSecretOrm = ormify<object, typeof TableName.UserSecrets>(db, TableName.UserSecrets);

  const countAllUserOrgSecrets = async ({ orgId, userId }: { orgId: string; userId: string }) => {
    try {
      interface CountResult {
        count: string;
      }

      const count = await db
        .replicaNode()(TableName.UserSecrets)
        .where(`${TableName.UserSecrets}.organization_id`, orgId)
        .where(`${TableName.UserSecrets}.created_by`, userId)
        .count("*")
        .first();

      return parseInt((count as unknown as CountResult).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count all user-org secrets" });
    }
  };

  const findUserSecretById = async (id: string, tx?: Knex): Promise<TUserSecrets | undefined> => {
    try {
      const [secret] = await (tx || db)(TableName.UserSecrets)
        .where({ id })
        .select(selectAllTableCols(TableName.UserSecrets));

      return secret;
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Find User Secret By Id"
      });
    }
  };

  const softDeleteById = async (id: string, tx?: Knex): Promise<void> => {
    try {
      await (tx || db)(TableName.UserSecrets).where({ id }).update({
        encrypted_data: "",
        iv: "",
        tag: ""
      });
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Soft Delete User Secret"
      });
    }
  };

  return {
    ...userSecretOrm,
    countAllUserOrgSecrets,
    findUserSecretById,
    softDeleteById
  };
};
