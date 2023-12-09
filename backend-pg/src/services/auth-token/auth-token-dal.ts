import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TAuthTokens, TAuthTokenSessions } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { TDeleteTokenForUserDalDTO } from "./auth-token-types";

export type TTokenDalConfig = {};

export type TTokenDalFactory = ReturnType<typeof tokenDalFactory>;

// TODO(akhilmhdh-pg): wrap all with database error
export const tokenDalFactory = (db: TDbClient) => {
  const authOrm = ormify(db, TableName.AuthTokens);

  const findOneTokenSession = async (
    filter: Partial<TAuthTokenSessions>
  ): Promise<TAuthTokenSessions | undefined> =>
    db(TableName.AuthTokenSession).where(filter).first();

  const deleteTokenForUser = async ({
    userId,
    type,
    orgId
  }: TDeleteTokenForUserDalDTO): Promise<TAuthTokens[] | undefined> =>
    db(TableName.AuthTokens).where({ userId, type, orgId }).delete().returning("*");

  const decrementTriesField = async ({
    userId,
    type
  }: TDeleteTokenForUserDalDTO): Promise<void> => {
    await db(TableName.AuthTokens).where({ userId, type }).decrement("triesLeft", 1);
  };

  const findTokenSessions = async (filter: Partial<TAuthTokenSessions>, tx?: Knex) => {
    try {
      const sessions = await (tx || db)(TableName.AuthTokenSession).where(filter);
      return sessions;
    } catch (error) {
      throw new DatabaseError({ name: "Find all token session", error });
    }
  };

  const insertTokenSession = async (
    userId: string,
    ip: string,
    userAgent: string
  ): Promise<TAuthTokenSessions | undefined> => {
    const [session] = await db(TableName.AuthTokenSession)
      .insert({
        userId,
        ip,
        userAgent,
        accessVersion: 1,
        refreshVersion: 1,
        lastUsed: new Date()
      })
      .returning("*");
    return session;
  };

  const incrementTokenSessionVersion = async (
    userId: string,
    sessionId: string
  ): Promise<TAuthTokenSessions | undefined> => {
    const [session] = await db(TableName.AuthTokenSession)
      .where({ userId, id: sessionId })
      .increment("accessVersion", 1)
      .increment("refreshVersion", 1)
      .returning("*");
    return session;
  };

  const deleteTokenSession = async (filter: Partial<TAuthTokenSessions>, tx?: Knex) => {
    try {
      const sessions = await (tx || db)(TableName.AuthTokenSession)
        .where(filter)
        .del()
        .returning("*");
      return sessions;
    } catch (error) {
      throw new DatabaseError({ name: "Delete token session", error });
    }
  };

  return {
    ...authOrm,
    findTokenSessions,
    deleteTokenForUser,
    decrementTriesField,
    findOneTokenSession,
    insertTokenSession,
    incrementTokenSessionVersion,
    deleteTokenSession
  };
};
