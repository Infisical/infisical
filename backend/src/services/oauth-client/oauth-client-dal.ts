import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TOauthClientDALFactory = ReturnType<typeof oauthClientDALFactory>;

export const oauthClientDALFactory = (db: TDbClient) => {
  const oauthClientOrm = ormify(db, TableName.OauthClient);

  const findByIdOnPrimary = async (id: string) => {
    try {
      return await db(TableName.OauthClient).where({ id }).first();
    } catch (error) {
      throw new DatabaseError({ error, name: "FindOauthClientByIdOnPrimary" });
    }
  };

  return { ...oauthClientOrm, findByIdOnPrimary };
};
