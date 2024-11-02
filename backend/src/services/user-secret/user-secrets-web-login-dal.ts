import { TDbClient } from "@app/db";
import { TableName, TUserSecretsWebLoginInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { Knex } from "knex";

export type TUserSecretsWebLoginDALFactory = ReturnType<typeof userSecretsWebLoginDALFactory>;

export const userSecretsWebLoginDALFactory = (db: TDbClient) => {
  const webLoginOrm = ormify(db, TableName.UserSecretWebLogin);

  const insert = async (data: TUserSecretsWebLoginInsert, tx?: Knex) => {
    try {
      const [result] = await (tx || db)(TableName.UserSecretWebLogin)
        .insert(data)
        .returning(selectAllTableCols(TableName.UserSecretWebLogin));
      return result;
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Insert User Secret Web Login"
      });
    }
  };

  const deleteById = async (id: string, tx?: Knex) => {
    try {
      const [result] = await (tx || db)(TableName.UserSecretWebLogin)
        .where({ id })
        .delete()
        .returning(selectAllTableCols(TableName.UserSecretWebLogin));
      return result;
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Delete User Secret Web Login"
      });
    }
  };

  const deleteBySecretId = async (secretId: string, tx?: Knex) => {
    await (tx || db)(TableName.UserSecretWebLogin).where({ secretId }).delete();
  };

  const findById = async (id: string, tx?: Knex) => {
    try {
      return await (tx || db)(TableName.UserSecretWebLogin)
        .where({ id })
        .select(selectAllTableCols(TableName.UserSecretWebLogin))
        .first();
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Find User Secret Web Login By Id"
      });
    }
  };

  const updateBySecretId = async (secretId: string, data: Partial<TUserSecretsWebLoginInsert>, tx?: Knex) => {
    const queryBuilder = tx || db;
    await queryBuilder(TableName.UserSecretWebLogin).where({ secretId }).update(data);
  };

  return {
    ...webLoginOrm,
    insert,
    deleteById,
    deleteBySecretId,
    findById,
    updateBySecretId
  };
};
