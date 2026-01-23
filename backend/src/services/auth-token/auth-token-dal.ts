import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TAuthTokenSessions } from "@app/db/schemas/auth-token-sessions";
import { TAuthTokens } from "@app/db/schemas/auth-tokens";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { TDeleteTokenForUserDALDTO } from "./auth-token-types";

export type TTokenDALFactory = ReturnType<typeof tokenDALFactory>;

export const tokenDALFactory = (db: TDbClient) => {
  const authOrm = ormify(db, TableName.AuthTokens);

  const findOneTokenSession = async (
    filter: Partial<TAuthTokenSessions>,
    tx?: Knex
  ): Promise<TAuthTokenSessions | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.AuthTokenSession).where(filter).first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindOneTokenSession" });
    }
  };

  const deleteTokenForUser = async ({
    userId,
    type,
    orgId
  }: TDeleteTokenForUserDALDTO): Promise<TAuthTokens[] | undefined> => {
    try {
      const doc = await db(TableName.AuthTokens).where({ userId, type, orgId }).delete().returning("*");
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "DeleteTokenForUser" });
    }
  };

  const decrementTriesField = async ({ userId, type }: TDeleteTokenForUserDALDTO): Promise<void> => {
    try {
      await db(TableName.AuthTokens).where({ userId, type }).decrement("triesLeft", 1);
    } catch (error) {
      throw new DatabaseError({ error, name: "DecrementTriesField" });
    }
  };

  const findTokenSessions = async (filter: Partial<TAuthTokenSessions>, tx?: Knex) => {
    try {
      const sessions = await (tx || db.replicaNode())(TableName.AuthTokenSession)
        .where(filter)
        .orderBy("lastUsed", "desc");

      return sessions;
    } catch (error) {
      throw new DatabaseError({ name: "Find all token session", error });
    }
  };

  const insertTokenSession = async (
    userId: string,
    ip: string,
    userAgent: string,
    tx?: Knex
  ): Promise<TAuthTokenSessions | undefined> => {
    try {
      const [session] = await (tx || db)(TableName.AuthTokenSession)
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
    } catch (error) {
      throw new DatabaseError({ error, name: "InsertTokenSession" });
    }
  };

  const incrementTokenSessionVersion = async (
    userId: string,
    sessionId: string
  ): Promise<TAuthTokenSessions | undefined> => {
    try {
      const [session] = await db(TableName.AuthTokenSession)
        .where({ userId, id: sessionId })
        .increment("accessVersion", 1)
        .increment("refreshVersion", 1)
        .returning("*");
      return session;
    } catch (error) {
      throw new DatabaseError({ error, name: "IncrementTokenSessionVersion" });
    }
  };

  const deleteTokenSession = async (filter: Partial<TAuthTokenSessions>, tx?: Knex) => {
    try {
      const sessions = await (tx || db)(TableName.AuthTokenSession).where(filter).del().returning("*");
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
