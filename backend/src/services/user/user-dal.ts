import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  TableName,
  TUserActionsInsert,
  TUserActionsUpdate,
  TUserEncryptionKeys,
  TUserEncryptionKeysInsert,
  TUserEncryptionKeysUpdate
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TUserDALFactory = ReturnType<typeof userDALFactory>;

export const userDALFactory = (db: TDbClient) => {
  const userOrm = ormify(db, TableName.Users);
  const findUserByEmail = async (email: string, tx?: Knex) => userOrm.findOne({ email }, tx);

  // USER ENCRYPTION FUNCTIONS
  // -------------------------
  const findUserEncKeyByEmail = async (email: string) => {
    try {
      return await db(TableName.Users)
        .where({ email })
        .join(TableName.UserEncryptionKey, `${TableName.Users}.id`, `${TableName.UserEncryptionKey}.userId`)
        .first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find user enc by email" });
    }
  };

  const findUserEncKeyByUserId = async (userId: string) => {
    try {
      const user = await db(TableName.Users)
        .where(`${TableName.Users}.id`, userId)
        .join(TableName.UserEncryptionKey, `${TableName.Users}.id`, `${TableName.UserEncryptionKey}.userId`)
        .first();
      if (user?.id) {
        // change to user id
        user.id = user.userId;
      }
      return user;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find user enc by user id" });
    }
  };

  const findUserByProjectMembershipId = async (projectMembershipId: string) => {
    try {
      return await db(TableName.ProjectMembership)
        .where({ [`${TableName.ProjectMembership}.id` as "id"]: projectMembershipId })
        .join(TableName.Users, `${TableName.ProjectMembership}.userId`, `${TableName.Users}.id`)
        .first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find user by project membership id" });
    }
  };

  const createUserEncryption = async (data: TUserEncryptionKeysInsert, tx?: Knex) => {
    try {
      const [userEnc] = await (tx || db)(TableName.UserEncryptionKey).insert(data).returning("*");
      return userEnc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create user encryption" });
    }
  };

  const updateUserEncryptionByUserId = async (userId: string, data: TUserEncryptionKeysUpdate, tx?: Knex) => {
    try {
      const [userEnc] = await (tx || db)(TableName.UserEncryptionKey)
        .where({ userId })
        .update({ ...data })
        .returning("*");
      return userEnc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Update user enc by user id" });
    }
  };

  const upsertUserEncryptionKey = async (
    userId: string,
    data: Omit<TUserEncryptionKeysUpdate, "userId">,
    tx?: Knex
  ) => {
    try {
      const [userEnc] = await (tx ? tx(TableName.UserEncryptionKey) : db(TableName.UserEncryptionKey))
        // if user insert make sure to pass all required data
        .insert({ userId, ...data } as TUserEncryptionKeys)
        .onConflict("userId")
        .merge()
        .returning("*");
      return userEnc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert user enc key" });
    }
  };

  // USER ACTION FUNCTIONS
  // ---------------------
  const findOneUserAction = (filter: TUserActionsUpdate, tx?: Knex) => {
    try {
      return (tx || db)(TableName.UserAction).where(filter).first("*");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one user action" });
    }
  };

  const createUserAction = async (data: TUserActionsInsert, tx?: Knex) => {
    try {
      const [userAction] = await (tx || db)(TableName.UserAction).insert(data).returning("*");
      return userAction;
    } catch (error) {
      throw new DatabaseError({ error, name: "Create user action" });
    }
  };

  return {
    ...userOrm,
    findUserByEmail,
    findUserEncKeyByEmail,
    findUserEncKeyByUserId,
    updateUserEncryptionByUserId,
    findUserByProjectMembershipId,
    upsertUserEncryptionKey,
    createUserEncryption,
    findOneUserAction,
    createUserAction
  };
};
