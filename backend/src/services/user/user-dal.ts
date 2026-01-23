import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { AccessScope, TableName } from "@app/db/schemas/models";
import { TUserActionsInsert, TUserActionsUpdate } from "@app/db/schemas/user-actions";
import {
  TUserEncryptionKeys,
  TUserEncryptionKeysInsert,
  TUserEncryptionKeysUpdate
} from "@app/db/schemas/user-encryption-keys";
import { TUsers, UsersSchema } from "@app/db/schemas/users";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

export type TUserDALFactory = ReturnType<typeof userDALFactory>;

export const userDALFactory = (db: TDbClient) => {
  const userOrm = ormify(db, TableName.Users);
  const findUserByUsername = async (username: string, tx?: Knex) =>
    (tx || db.replicaNode())(TableName.Users).whereRaw('lower("username") = :username', {
      username: username.toLowerCase()
    });

  const findUserByEmail = async (email: string, tx?: Knex) =>
    (tx || db.replicaNode())(TableName.Users)
      .whereRaw('lower("email") = :email', { email: email.toLowerCase() })
      .where({
        isEmailVerified: true
      });

  const getUsersByFilter = async ({
    limit,
    offset,
    searchTerm,
    sortBy,
    adminsOnly
  }: {
    limit: number;
    offset: number;
    searchTerm: string;
    sortBy?: keyof TUsers;
    adminsOnly: boolean;
  }) => {
    try {
      let query = db.replicaNode()(TableName.Users).where("isGhost", "=", false);

      if (searchTerm) {
        query = query.where((qb) => {
          void qb
            .whereILike("email", `%${searchTerm}%`)
            .orWhereILike("firstName", `%${searchTerm}%`)
            .orWhereILike("lastName", `%${searchTerm}%`)
            .orWhereRaw('lower("username") like ?', `%${searchTerm}%`);
        });
      }

      if (adminsOnly) {
        query = query.where("superAdmin", true);
      }

      const countQuery = query.clone();

      if (sortBy) {
        query = query.orderBy(sortBy);
      }

      const [users, totalResult] = await Promise.all([
        query.limit(limit).offset(offset).select(selectAllTableCols(TableName.Users)),
        countQuery.count("*", { as: "count" }).first()
      ]);

      const total = Number(totalResult?.count || 0);

      return { users, total };
    } catch (error) {
      throw new DatabaseError({ error, name: "Get users by filter" });
    }
  };

  // USER ENCRYPTION FUNCTIONS
  // -------------------------
  const findUserEncKeyByUsername = async ({ username }: { username: string }) => {
    try {
      return await db
        .replicaNode()(TableName.Users)
        .whereRaw('lower("username") = :username', { username: username.toLowerCase() })
        .where({
          isGhost: false
        })
        .join(TableName.UserEncryptionKey, `${TableName.Users}.id`, `${TableName.UserEncryptionKey}.userId`);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find user enc by email" });
    }
  };

  const findUserEncKeyByUserIdsBatch = async ({ userIds }: { userIds: string[] }, tx?: Knex) => {
    try {
      return await (tx || db.replicaNode())(TableName.Users)
        .where({
          isGhost: false
        })
        .whereIn(`${TableName.Users}.id`, userIds)
        .join(TableName.UserEncryptionKey, `${TableName.Users}.id`, `${TableName.UserEncryptionKey}.userId`);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find user enc by user ids batch" });
    }
  };

  const findUserEncKeyByUserId = async (userId: string, tx?: Knex) => {
    try {
      const user = await (tx || db.replicaNode())(TableName.Users)
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
      return await db
        .replicaNode()(TableName.Membership)
        .where({
          [`${TableName.Membership}.id` as "id"]: projectMembershipId,
          [`${TableName.Membership}.scope` as "scope"]: AccessScope.Project
        })
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find user by project membership id" });
    }
  };

  const findUsersByProjectMembershipIds = async (projectMembershipIds: string[]) => {
    try {
      return await db
        .replicaNode()(TableName.Membership)
        .whereIn(`${TableName.Membership}.id`, projectMembershipIds)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .whereNotNull(`${TableName.Membership}.actorUserId`)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
        .select("*");
    } catch (error) {
      throw new DatabaseError({ error, name: "Find users by project membership ids" });
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

  const findAllMyAccounts = async (email: string) => {
    try {
      const doc = await db(TableName.Users)
        .where({ email })
        .leftJoin(TableName.Membership, (qb) => {
          void qb
            .on(`${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
            .andOn(`${TableName.Membership}.scope`, db.raw("?", [AccessScope.Organization]));
        })
        .leftJoin(TableName.Organization, `${TableName.Organization}.id`, `${TableName.Membership}.scopeOrgId`)
        .select(selectAllTableCols(TableName.Users))
        .select(
          db.ref("name").withSchema(TableName.Organization).as("orgName"),
          db.ref("slug").withSchema(TableName.Organization).as("orgSlug")
        );
      const formattedDoc = sqlNestRelationships({
        data: doc,
        key: "id",
        parentMapper: (el) => UsersSchema.parse(el),
        childrenMapper: [
          {
            key: "orgSlug",
            label: "organizations" as const,
            mapper: ({ orgSlug, orgName }) => ({
              slug: orgSlug,
              name: orgName
            })
          }
        ]
      });
      return formattedDoc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert user enc key" });
    }
  };

  // USER ACTION FUNCTIONS
  // ---------------------
  const findOneUserAction = (filter: TUserActionsUpdate, tx?: Knex) => {
    try {
      return (tx || db.replicaNode())(TableName.UserAction).where(filter).first("*");
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
    findUserByUsername,
    findUserEncKeyByUsername,
    findUserEncKeyByUserIdsBatch,
    findUserEncKeyByUserId,
    updateUserEncryptionByUserId,
    findUserByProjectMembershipId,
    findUsersByProjectMembershipIds,
    upsertUserEncryptionKey,
    createUserEncryption,
    findOneUserAction,
    createUserAction,
    getUsersByFilter,
    findAllMyAccounts,
    findUserByEmail
  };
};
