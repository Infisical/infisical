import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TBackupPrivateKey, TUser, TUserEncryptionKey } from "@app/db/schemas";

export type TAuthDalFactory = ReturnType<typeof authDalFactory>;

export const authDalFactory = (db: TDbClient) => {
  // getters
  const getUserByEmail = async (email: string): Promise<TUser | undefined> =>
    db(TableName.Users).where({ email }).select("*").first();

  const getUserById = async (userId: string): Promise<TUser | undefined> =>
    db(TableName.Users).where({ id: userId }).select("*").first();

  const getUserEncKeyByEmail = async (email: string) =>
    db(TableName.Users)
      .where({ email })
      .join(
        TableName.UserEncryptionKey,
        `${TableName.Users}.id`,
        `${TableName.UserEncryptionKey}.userId`
      )
      .first();

  const getUserEncKeyByUserId = async (userId: string) =>
    db(TableName.Users)
      .where({ id: userId })
      .join(
        TableName.UserEncryptionKey,
        `${TableName.Users}.id`,
        `${TableName.UserEncryptionKey}.userId`
      )
      .first();

  const getBackupPrivateKeyByUserId = async (userId: string) =>
    db(TableName.BackupPrivateKey).where({ userId }).first("*");

  // all inserts and updates
  const createUser = async (
    email: string,
    data: Partial<TUser> = {}
  ): Promise<TUser | undefined> => {
    const [user] = await db(TableName.Users)
      .insert({ email, ...data })
      .returning("*");
    return user;
  };

  const updateUser = async (
    email: string,
    data: Partial<TUser> = {}
  ): Promise<TUser | undefined> => {
    const [user] = await db(TableName.Users)
      .where({ email })
      .update({ ...data })
      .returning("*");
    return user;
  };

  const updateUserById = async (
    id: string,
    data: Partial<TUser> = {},
    tx?: Knex
  ): Promise<TUser | undefined> => {
    const [user] = await (tx ? tx(TableName.Users) : db(TableName.Users))
      .where({ id })
      .update({ ...data })
      .returning("*");
    return user;
  };

  const updateUserEncryptionByUserId = async (
    userId: string,
    data: Partial<TUserEncryptionKey> = {},
    tx?: Knex
  ): Promise<TUserEncryptionKey | undefined> => {
    const [userEnc] = await (tx ? tx(TableName.UserEncryptionKey) : db(TableName.UserEncryptionKey))
      .where({ userId })
      .update({ ...data })
      .returning("*");
    return userEnc;
  };

  // all upserts
  const upsertUserEncryptionKey = async (
    userId: string,
    data: Partial<TUserEncryptionKey>,
    tx?: Knex
  ) => {
    const [userEnc] = await (tx ? tx(TableName.UserEncryptionKey) : db(TableName.UserEncryptionKey))
      // if user insert make sure to pass all required data
      .insert({ userId, ...data } as TUserEncryptionKey)
      .onConflict("userId")
      .merge()
      .returning("*");
    return userEnc;
  };

  const upsertBackupKey = async (
    userId: string,
    data: Partial<TBackupPrivateKey>,
    tx?: Knex
  ): Promise<TBackupPrivateKey | undefined> => {
    const [backupKey] = await (tx ? tx(TableName.BackupPrivateKey) : db(TableName.BackupPrivateKey))
      .insert({ userId, ...data, updatedAt: new Date().toUTCString() } as TBackupPrivateKey)
      .onConflict("userId")
      .merge()
      .returning("*");
    return backupKey;
  };

  return {
    transaction: async <T>(cb: (tx: Knex) => T) =>
      db.transaction(async (trx) => {
        const res = await cb(trx);
        return res;
      }),
    getUserByEmail,
    getUserById,
    getUserEncKeyByEmail,
    getUserEncKeyByUserId,
    getBackupPrivateKeyByUserId,
    createUser,
    updateUser,
    updateUserById,
    updateUserEncryptionByUserId,
    upsertUserEncryptionKey,
    upsertBackupKey
  };
};
