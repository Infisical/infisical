import { TDbClient } from "@app/db";
import { TableName, TUserSecretsCreditCard, TUserSecretsCreditCardInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { Knex } from "knex";

export type TUserSecretCreditCardDALFactory = ReturnType<typeof userSecretCreditCardDALFactory>;

export const userSecretCreditCardDALFactory = (db: TDbClient) => {
  const userSecretCreditCardOrm = ormify(db, TableName.UserSecretCreditCard);

  const insert = async (data: TUserSecretsCreditCardInsert, tx?: Knex) => {
    try {
      await (tx || db)(TableName.UserSecretCreditCard).insert(data);
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Insert User Secret Credit Card"
      });
    }
  };

  const deleteById = async (id: string, tx?: Knex) => {
    try {
      await (tx || db)(TableName.UserSecretCreditCard).where({ id }).delete();
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Delete User Secret Credit Card"
      });
    }
  };

  const deleteBySecretId = async (secretId: string, tx?: Knex) => {
    await (tx || db)(TableName.UserSecretCreditCard).where({ secretId }).delete();
  };

  const find = async (
    criteria: Partial<TUserSecretsCreditCard>,
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

      const query = queryBuilder(TableName.UserSecretCreditCard)
        .select(selectAllTableCols(TableName.UserSecretCreditCard))
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
        name: "Find User Secret Credit Card"
      });
    }
  };

  const updateBySecretId = async (secretId: string, data: Partial<TUserSecretsCreditCardInsert>, tx?: Knex) => {
    const queryBuilder = tx || db;
    const query = queryBuilder(TableName.UserSecretCreditCard).where({ secretId }).update(data);
    console.log(query);
    return await query;
  };

  return {
    ...userSecretCreditCardOrm,
    insert,
    deleteById,
    find,
    updateBySecretId,
    deleteBySecretId
  };
};
