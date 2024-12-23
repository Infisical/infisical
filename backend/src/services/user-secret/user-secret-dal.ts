import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TUserSecrets } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TUserSecretDALFactory = ReturnType<typeof userSecretDALFactory>;

export const userSecretDALFactory = (db: TDbClient) => {
  const userSecretOrm = ormify<object, typeof TableName.UserSecrets>(db, TableName.UserSecrets);

  const findUserSecrets = async (
    options: { offset?: number; limit?: number } = {},
    tx?: Knex
  ): Promise<{ secrets: TUserSecrets[]; totalCount: number }> => {
    try {
      // Get secrets with pagination
      const secrets = await (tx || db)(TableName.UserSecrets)
        .select(selectAllTableCols(TableName.UserSecrets))
        .orderBy("createdAt", "desc")
        .offset(options.offset || 0)
        .limit(options.limit || 10);

      // Get total count
      const result = await (tx || db)(TableName.UserSecrets).count().first();
      const totalCount = result?.count || 0;

      return {
        secrets,
        totalCount: typeof totalCount === "string" ? parseInt(totalCount, 10) : totalCount
      };
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Find User Secrets"
      });
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

  const createUserSecret = async (
    data: Omit<TUserSecrets, "id" | "createdAt" | "updatedAt">,
    tx?: Knex
  ): Promise<TUserSecrets> => {
    try {
      const [secret] = await (tx || db)(TableName.UserSecrets)
        .insert(data)
        .returning(selectAllTableCols(TableName.UserSecrets));

      return secret;
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Create User Secret"
      });
    }
  };

  const updateUserSecretById = async (
    id: string,
    data: Partial<Pick<TUserSecrets, "name" | "encryptedData">>,
    tx?: Knex
  ): Promise<TUserSecrets> => {
    try {
      const [secret] = await (tx || db)(TableName.UserSecrets)
        .where({ id })
        .update({
          ...data
        })
        .returning(selectAllTableCols(TableName.UserSecrets));

      if (!secret) {
        throw new DatabaseError({
          error: new Error("No secret found to update"),
          name: "Update User Secret"
        });
      }

      return secret;
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Update User Secret"
      });
    }
  };

  const deleteById = async (id: string, tx?: Knex): Promise<void> => {
    try {
      await (tx || db)(TableName.UserSecrets).where({ id }).delete();
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Delete User Secret"
      });
    }
  };

  return {
    ...userSecretOrm,
    findUserSecrets,
    findUserSecretById,
    createUserSecret,
    updateUserSecretById,
    deleteById
  };
};
