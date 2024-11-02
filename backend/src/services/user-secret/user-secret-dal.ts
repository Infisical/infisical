import { TDbClient } from "@app/db";
import { TableName, TUserSecrets, TUserSecretsInsert } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { Knex } from "knex";

export type TUserSecretDALFactory = ReturnType<typeof userSecretDALFactory>;

export const userSecretDALFactory = (db: TDbClient) => {
  const userSecretOrm = ormify(db, TableName.UserSecret);

  const insert = async (data: TUserSecretsInsert, tx?: Knex) => {
    try {
      const [result] = await (tx || db)(TableName.UserSecret)
        .insert(data)
        .returning(selectAllTableCols(TableName.UserSecret));
      return result;
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Insert User Secret"
      });
    }
  };

  const deleteById = async (id: string, tx?: Knex) => {
    try {
      const [result] = await (tx || db)(TableName.UserSecret)
        .where({ id })
        .delete()
        .returning(selectAllTableCols(TableName.UserSecret));
      return result;
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Delete User Secret"
      });
    }
  };

  const getAll = async (
    {
      userId,
      offset = 0,
      limit = 10
    }: {
      userId: string;
      offset?: number;
      limit?: number;
    },
    tx?: Knex
  ) => {
    try {
      return await (tx || db)(TableName.UserSecret)
        .where({ userId })
        .select(selectAllTableCols(TableName.UserSecret))
        .orderBy("createdAt", "desc")
        .offset(offset)
        .limit(limit);
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Get All User Secrets"
      });
    }
  };

  const countAllUserSecrets = async ({ userId, searchQuery }: { userId: string; searchQuery?: string }) => {
    try {
      interface CountResult {
        count: string;
      }

      const baseQuery = db.replicaNode()(TableName.UserSecret).where(`${TableName.UserSecret}.userId`, userId);

      if (searchQuery) {
        baseQuery.where((builder) => {
          builder
            .whereILike(`${TableName.UserSecret}.name`, `%${searchQuery}%`)
            .orWhereILike(`${TableName.UserSecret}.description`, `%${searchQuery}%`);
        });
      }

      const count = await baseQuery.count("*").first();

      return parseInt((count as unknown as CountResult).count || "0", 10);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count all user secrets" });
    }
  };

  const find = async (
    criteria: Partial<TUserSecrets> & { searchQuery?: string },
    options: {
      offset?: number;
      limit?: number;
      sort?: [string, "asc" | "desc"][];
    } = {},
    tx?: Knex
  ) => {
    try {
      const { offset = 0, limit = 10, sort = [] } = options;
      const { searchQuery, ...restCriteria } = criteria;
      const queryBuilder = tx || db;

      const baseQuery = queryBuilder(TableName.UserSecret)
        .select([
          `${TableName.UserSecret}.*`,
          `${TableName.UserSecretWebLogin}.username as username`,
          `${TableName.UserSecretWebLogin}.password as password`,
          `${TableName.UserSecretWebLogin}.website as website`,
          `${TableName.UserSecretWebLogin}.iv as webLogin_iv`,
          `${TableName.UserSecretWebLogin}.tag as webLogin_tag`,
          `${TableName.UserSecretCreditCard}.cardNumber as cardNumber`,
          `${TableName.UserSecretCreditCard}.cardholderName as cardholderName`,
          `${TableName.UserSecretCreditCard}.expiryDate as expiryDate`,
          `${TableName.UserSecretCreditCard}.cvv as cvv`,
          `${TableName.UserSecretCreditCard}.iv as creditCard_iv`,
          `${TableName.UserSecretCreditCard}.tag as creditCard_tag`,
          `${TableName.UserSecretSecureNote}.content as content`,
          `${TableName.UserSecretSecureNote}.title as title`
        ])
        .leftJoin(TableName.UserSecretWebLogin, function () {
          this.on(`${TableName.UserSecret}.id`, "=", `${TableName.UserSecretWebLogin}.secretId`);
        })
        .leftJoin(TableName.UserSecretCreditCard, function () {
          this.on(`${TableName.UserSecret}.id`, "=", `${TableName.UserSecretCreditCard}.secretId`);
        })
        .leftJoin(TableName.UserSecretSecureNote, function () {
          this.on(`${TableName.UserSecret}.id`, "=", `${TableName.UserSecretSecureNote}.secretId`);
        })
        .where(restCriteria);

      if (searchQuery) {
        baseQuery.where((builder) => {
          builder
            .whereILike(`${TableName.UserSecret}.name`, `%${searchQuery}%`)
            .orWhereILike(`${TableName.UserSecret}.description`, `%${searchQuery}%`);
        });
      }

      sort.forEach(([column, direction]) => {
        baseQuery.orderBy(`${TableName.UserSecret}.${column}`, direction);
      });

      const results = await baseQuery.offset(Number(offset)).limit(Number(limit));

      return results;
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Find User Secret"
      });
    }
  };

  const update = async (id: string, data: { name?: string; description?: string }, tx?: Knex) => {
    const queryBuilder = tx || db;
    await queryBuilder(TableName.UserSecret).where({ id }).update(data);
  };

  return {
    ...userSecretOrm,
    insert,
    deleteById,
    getAll,
    countAllUserSecrets,
    find,
    update
  };
};
