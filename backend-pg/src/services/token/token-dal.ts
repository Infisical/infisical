import { TDbClient } from "@app/db";
import { TableName, TToken } from "@app/db/schemas";
import { TTokenSession } from "@app/db/schemas/token-session";

import {
  TDeleteTokenForUserDalDTO,
  TGetTokenForUserDalDTO,
  TUpsertTokenForUserDalDTO
} from "./token-types";

export type TTokenDalConfig = {};

export type TTokenDalFactory = ReturnType<typeof tokenDalFactory>;

export const tokenDalFactory = (db: TDbClient) => {
  const upsertTokenForUser = async ({
    tokenHash,
    expiresAt,
    userId,
    type,
    triesLeft
  }: TUpsertTokenForUserDalDTO): Promise<TToken | undefined> => {
    const token = await db.transaction(async (tx) => {
      await tx(TableName.AuthTokens).where({ userId, type }).delete().returning("*");
      const [newToken] = await tx(TableName.AuthTokens)
        .insert({ tokenHash, expiresAt: expiresAt.toUTCString(), type, userId, triesLeft })
        .returning("*");
      return newToken;
    });
    return token;
  };

  const getTokenForUser = async ({
    userId,
    type
  }: TGetTokenForUserDalDTO): Promise<TToken | undefined> =>
    db(TableName.AuthTokens).where({ userId, type }).first();

  const deleteTokenForUser = async ({
    userId,
    type
  }: TDeleteTokenForUserDalDTO): Promise<TToken[] | undefined> =>
    db(TableName.AuthTokens).where({ userId, type }).delete().returning("*");

  const decrementTriesField = async ({
    userId,
    type
  }: TDeleteTokenForUserDalDTO): Promise<void> => {
    await db(TableName.AuthTokens).where({ userId, type }).decrement("triesLeft", 1);
  };

  const getTokenSession = async (
    userId: string,
    ip: string,
    userAgent: string
  ): Promise<TTokenSession | undefined> =>
    db(TableName.AuthTokenSession).where({ userId, ip, userAgent }).first();

  const insertTokenSession = async (
    userId: string,
    ip: string,
    userAgent: string
  ): Promise<TTokenSession | undefined> => {
    const [session] = await db(TableName.AuthTokenSession)
      .insert({
        userId,
        ip,
        userAgent,
        accessVersion: 1,
        refreshVersion: 1,
        lastUsed: new Date().toUTCString()
      })
      .returning("*");
    return session;
  };

  const incrementVersion = async (
    userId: string,
    sessionId: string
  ): Promise<TTokenSession | undefined> => {
    const [session] = await db(TableName.AuthTokenSession)
      .where({ userId, id: sessionId })
      .increment("accessVersion", 1)
      .increment("refreshVersion", 1)
      .returning("*");
    return session;
  };

  return {
    upsertTokenForUser,
    getTokenForUser,
    deleteTokenForUser,
    decrementTriesField,
    getTokenSession,
    insertTokenSession,
    incrementVersion
  };
};
