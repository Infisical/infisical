import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TUserSecret } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TUserSecretDALFactory = ReturnType<typeof userSecretDALFactory>;

export const userSecretDALFactory = (db: TDbClient) => {
  const sharedSecretOrm = ormify(db, TableName.UserSecret);

  const countAllUserOrgSecrets = async ({ orgId, userId }: { orgId: string; userId: string }) => {
    try {
      interface CountResult {
        count: string;
      }

      const count = await db
        .replicaNode()(TableName.UserSecret)
        .where(`${TableName.UserSecret}.orgId`, orgId)
        .where(`${TableName.UserSecret}.userId`, userId)
        .count("*")
        .first();

      return parseInt((count as unknown as CountResult).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count all user-org shared secrets" });
    }
  };

  const findUserSecrets = async (filters: Partial<TUserSecret>, tx?: Knex) => {
    try {
      return await (tx || db)(TableName.UserSecret)
        .where(filters)
        .andWhere("encryptedValue", "<>", "")
        .select(selectAllTableCols(TableName.UserSecret));
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Find User Secrets"
      });
    }
  };

  const softDeleteById = async (id: string) => {
    try {
      await sharedSecretOrm.updateById(id, {
        encryptedValue: "",
        iv: ""
      });
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Soft Delete User Secret"
      });
    }
  };

  return {
    ...sharedSecretOrm,
    countAllUserOrgSecrets,
    softDeleteById,
    findUserSecrets
  };
};
