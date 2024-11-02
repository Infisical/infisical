import { TDbClient } from "@app/db";
import { TableName, TUserSecretsSecureNote, TUserSecretsSecureNoteInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { Knex } from "knex";

export type TUserSecretSecureNoteDALFactory = ReturnType<typeof userSecretSecureNoteDALFactory>;

export const userSecretSecureNoteDALFactory = (db: TDbClient) => {
  const userSecretSecureNoteOrm = ormify(db, TableName.UserSecretSecureNote);

  const insert = async (data: TUserSecretsSecureNoteInsert, tx?: Knex) => {
    try {
      await (tx || db)(TableName.UserSecretSecureNote).insert(data);
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Insert User Secret Secure Note"
      });
    }
  };

  const deleteById = async (id: string, tx?: Knex) => {
    try {
      await (tx || db)(TableName.UserSecretSecureNote).where({ id }).delete();
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Delete User Secret Secure Note"
      });
    }
  };

  const deleteBySecretId = async (secretId: string, tx?: Knex) => {
    await (tx || db)(TableName.UserSecretSecureNote).where({ secretId }).delete();
  };

  const find = async (
    criteria: Partial<TUserSecretsSecureNote>,
    options: {
      offset?: number;
      limit?: number;
      sort?: [string, "asc" | "desc"][];
    } = {},
    tx?: Knex
  ) => {
    try {
      const { offset = 0, limit = 10, sort = [] } = options;
      const queryBuilder = tx || db;

      const query = queryBuilder(TableName.UserSecretSecureNote)
        .select(selectAllTableCols(TableName.UserSecretSecureNote))
        .where(criteria)
        .offset(offset)
        .limit(limit);

      sort.forEach(([column, direction]) => {
        query.orderBy(column, direction);
      });

      return await query;
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Find User Secret Secure Note"
      });
    }
  };

  const updateBySecretId = async (secretId: string, data: Partial<TUserSecretsSecureNoteInsert>, tx?: Knex) => {
    const queryBuilder = tx || db;
    const query = queryBuilder(TableName.UserSecretSecureNote).where({ secretId }).update(data);
    return await query;
  };

  return {
    ...userSecretSecureNoteOrm,
    insert,
    deleteById,
    find,
    updateBySecretId,
    deleteBySecretId
  };
};
