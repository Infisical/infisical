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
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TUserDALFactory = ReturnType<typeof userDALFactory>;

export const userDALFactory = (db: TDbClient) => {
  const userOrm = ormify(db, TableName.Users);
  const findUserByUsername = async (username: string, tx?: Knex) => userOrm.findOne({ username }, tx);

  // USER ENCRYPTION FUNCTIONS
  // -------------------------
  const findUserEncKeyByUsername = async ({ username }: { username: string }) => {
    try {
      return await db(TableName.Users)
        .where({
          username,
          isGhost: false
        })
        .join(TableName.UserEncryptionKey, `${TableName.Users}.id`, `${TableName.UserEncryptionKey}.userId`)
        .first();
    } catch (error) {
      throw new DatabaseError({ error, name: "Find user enc by email" });
    }
  };

  const findUserEncKeyByUserIdsBatch = async ({ userIds }: { userIds: string[] }, tx?: Knex) => {
    try {
      return await (tx || db)(TableName.Users)
        .where({
          isGhost: false
        })
        .whereIn(`${TableName.Users}.id`, userIds)
        .join(TableName.UserEncryptionKey, `${TableName.Users}.id`, `${TableName.UserEncryptionKey}.userId`);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find user enc by user ids batch" });
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

  const findUsersByProjectId = async (projectId: string, userIds: string[]) => {
    try {
      const projectMembershipQuery = await db(TableName.ProjectMembership)
        .where({ projectId })
        .whereIn("userId", userIds)
        .join(TableName.Users, `${TableName.ProjectMembership}.userId`, `${TableName.Users}.id`)
        .select(selectAllTableCols(TableName.Users))
        .select(db.ref("id").withSchema(TableName.ProjectMembership).as("projectMembershipId"));

      const groupMembershipQuery = await db(TableName.UserGroupMembership)
        .whereIn("userId", userIds)
        .join(
          TableName.GroupProjectMembership,
          `${TableName.UserGroupMembership}.groupId`,
          `${TableName.GroupProjectMembership}.groupId` // this gives us access to the project id in the group membership
        )
        .where(`${TableName.GroupProjectMembership}.projectId`, projectId)
        .join(TableName.Users, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`)
        .select(selectAllTableCols(TableName.Users))
        .select(db.ref("id").withSchema(TableName.GroupProjectMembership).as("groupProjectMembershipId"));

      const projectMembershipUsers = projectMembershipQuery.map((user) => ({
        ...user,
        projectMembershipId: user.projectMembershipId,
        userGroupMembershipId: null
      }));

      const groupMembershipUsers = groupMembershipQuery.map((user) => ({
        ...user,
        projectMembershipId: null,
        groupProjectMembershipId: user.groupProjectMembershipId
      }));

      // return [...projectMembershipUsers, ...groupMembershipUsers];

      // There may be duplicates in the results since a user can have both a project membership, and access through a group, so we need to filter out potential duplicates.
      // We should prioritize project memberships over group memberships.
      const memberships = [...projectMembershipUsers, ...groupMembershipUsers];

      const uniqueMemberships = memberships.filter((user, index) => {
        const firstIndex = memberships.findIndex((u) => u.id === user.id);
        return firstIndex === index;
      });

      return uniqueMemberships;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find users by project id" });
    }
  };

  // if its a group membership, it should have a isGroupMembership flag
  const findUserByProjectId = async (projectId: string, userId: string) => {
    try {
      const projectMembership = await db(TableName.ProjectMembership)
        .where({ projectId, userId })
        .join(TableName.Users, `${TableName.ProjectMembership}.userId`, `${TableName.Users}.id`)
        .select(selectAllTableCols(TableName.Users))
        .select(db.ref("id").withSchema(TableName.ProjectMembership).as("projectMembershipId"))
        .first();

      const groupProjectMembership = await db(TableName.UserGroupMembership)
        .where({ userId })
        .join(
          TableName.GroupProjectMembership,
          `${TableName.UserGroupMembership}.groupId`,
          `${TableName.GroupProjectMembership}.groupId` // this gives us access to the project id in the group membership
        )
        .where(`${TableName.GroupProjectMembership}.projectId`, projectId)
        .join(TableName.Users, `${TableName.UserGroupMembership}.userId`, `${TableName.Users}.id`)
        .select(selectAllTableCols(TableName.Users))
        .select(db.ref("id").withSchema(TableName.GroupProjectMembership).as("groupProjectMembershipId"))
        .first();

      if (projectMembership) {
        return {
          ...projectMembership,
          projectMembershipId: projectMembership.projectMembershipId,
          groupProjectMembershipId: null
        };
      }

      if (groupProjectMembership) {
        return {
          ...groupProjectMembership,
          projectMembershipId: null,
          groupProjectMembershipId: groupProjectMembership.groupProjectMembershipId
        };
      }
    } catch (error) {
      throw new DatabaseError({ error, name: "Find user by project id" });
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

  const findUsersByProjectMembershipIds = async (projectMembershipIds: string[]) => {
    try {
      return await db(TableName.ProjectMembership)
        .whereIn(`${TableName.ProjectMembership}.id`, projectMembershipIds)
        .join(TableName.Users, `${TableName.ProjectMembership}.userId`, `${TableName.Users}.id`)
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
    findUserByUsername,
    findUsersByProjectId,
    findUserByProjectId,
    findUserEncKeyByUsername,
    findUserEncKeyByUserIdsBatch,
    findUserEncKeyByUserId,
    updateUserEncryptionByUserId,
    findUserByProjectMembershipId,
    findUsersByProjectMembershipIds,
    upsertUserEncryptionKey,
    createUserEncryption,
    findOneUserAction,
    createUserAction
  };
};
