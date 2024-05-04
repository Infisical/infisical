import { Knex } from "knex";
import { Tables } from "knex/types/tables";

import { TDbClient } from "@app/db";
import { TableName, TUserEncryptionKeys } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships, TFindFilter } from "@app/lib/knex";

export type TProjectMembershipDALFactory = ReturnType<typeof projectMembershipDALFactory>;

export const projectMembershipDALFactory = (db: TDbClient) => {
  const projectMembershipOrm = ormify(db, TableName.ProjectMembership);
  const accessApprovalRequestOrm = ormify(db, TableName.AccessApprovalRequest);
  const secretApprovalRequestOrm = ormify(db, TableName.SecretApprovalRequest);

  const deleteMany = async (filter: TFindFilter<Tables[TableName.ProjectMembership]["base"]>, tx?: Knex) => {
    const handleDeletion = async (processedTx: Knex) => {
      // Find all memberships
      const memberships = await projectMembershipOrm.find(filter, {
        tx: processedTx
      });

      // Delete all access approvals in this project from the users attached to these memberships
      await accessApprovalRequestOrm.delete(
        {
          $in: {
            projectMembershipId: memberships.map((membership) => membership.id)
          }
        },
        processedTx
      );

      for await (const membership of memberships) {
        const allPoliciesInProject = await (tx || db)(TableName.SecretApprovalRequest)
          .join(TableName.SecretFolder, `${TableName.SecretApprovalRequest}.folderId`, `${TableName.SecretFolder}.id`)
          .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
          .join(
            TableName.SecretApprovalPolicy,
            `${TableName.SecretApprovalRequest}.policyId`,
            `${TableName.SecretApprovalPolicy}.id`
          )
          .where({ [`${TableName.Environment}.projectId` as "projectId"]: membership.projectId })
          .where({ [`${TableName.SecretApprovalRequest}.committerUserId` as "committerUserId"]: membership.userId })
          .select(db.ref("id").withSchema(TableName.SecretApprovalPolicy).as("policyId"));

        await secretApprovalRequestOrm.delete(
          {
            $in: {
              policyId: allPoliciesInProject.map((policy) => policy.policyId)
            },
            committerUserId: membership.userId
          },
          processedTx
        );
        // Delete the actual project memberships
        await projectMembershipOrm.delete(
          {
            id: membership.id
          },
          processedTx
        );
      }

      return memberships;
    };

    if (tx) {
      return handleDeletion(tx);
    }
    return db.transaction(handleDeletion);
  };

  // special query
  const findAllProjectMembers = async (projectId: string) => {
    try {
      const docs = await db(TableName.ProjectMembership)
        .where({ [`${TableName.ProjectMembership}.projectId` as "projectId"]: projectId })
        .join(TableName.Users, `${TableName.ProjectMembership}.userId`, `${TableName.Users}.id`)
        .join<TUserEncryptionKeys>(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .join(
          TableName.ProjectUserMembershipRole,
          `${TableName.ProjectUserMembershipRole}.projectMembershipId`,
          `${TableName.ProjectMembership}.id`
        )
        .leftJoin(
          TableName.ProjectRoles,
          `${TableName.ProjectUserMembershipRole}.customRoleId`,
          `${TableName.ProjectRoles}.id`
        )
        .select(
          db.ref("id").withSchema(TableName.ProjectMembership),
          db.ref("isGhost").withSchema(TableName.Users),
          db.ref("username").withSchema(TableName.Users),
          db.ref("email").withSchema(TableName.Users),
          db.ref("publicKey").withSchema(TableName.UserEncryptionKey),
          db.ref("firstName").withSchema(TableName.Users),
          db.ref("lastName").withSchema(TableName.Users),
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.ref("role").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("id").withSchema(TableName.ProjectUserMembershipRole).as("membershipRoleId"),
          db.ref("customRoleId").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("name").withSchema(TableName.ProjectRoles).as("customRoleName"),
          db.ref("slug").withSchema(TableName.ProjectRoles).as("customRoleSlug"),
          db.ref("temporaryMode").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("isTemporary").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("temporaryRange").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("temporaryAccessStartTime").withSchema(TableName.ProjectUserMembershipRole),
          db.ref("temporaryAccessEndTime").withSchema(TableName.ProjectUserMembershipRole)
        )
        .where({ isGhost: false });

      const members = sqlNestRelationships({
        data: docs,
        parentMapper: ({ email, firstName, username, lastName, publicKey, isGhost, id, userId }) => ({
          isGroupMember: false,
          id,
          userId,
          projectId,
          user: { email, username, firstName, lastName, id: userId, publicKey, isGhost }
        }),
        key: "id",
        childrenMapper: [
          {
            label: "roles" as const,
            key: "membershipRoleId",
            mapper: ({
              role,
              customRoleId,
              customRoleName,
              customRoleSlug,
              membershipRoleId,
              temporaryRange,
              temporaryMode,
              temporaryAccessEndTime,
              temporaryAccessStartTime,
              isTemporary
            }) => ({
              id: membershipRoleId,
              role,
              customRoleId,
              customRoleName,
              customRoleSlug,
              temporaryRange,
              temporaryMode,
              temporaryAccessEndTime,
              temporaryAccessStartTime,
              isTemporary
            })
          }
        ]
      });
      return members;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all project members" });
    }
  };

  const findProjectGhostUser = async (projectId: string) => {
    try {
      const ghostUser = await db(TableName.ProjectMembership)
        .where({ projectId })
        .join(TableName.Users, `${TableName.ProjectMembership}.userId`, `${TableName.Users}.id`)
        .select(selectAllTableCols(TableName.Users))
        .where({ isGhost: true })
        .first();

      return ghostUser;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project top-level user" });
    }
  };

  const findMembershipsByUsername = async (projectId: string, usernames: string[]) => {
    try {
      const members = await db(TableName.ProjectMembership)
        .where({ projectId })
        .join(TableName.Users, `${TableName.ProjectMembership}.userId`, `${TableName.Users}.id`)
        .join<TUserEncryptionKeys>(
          TableName.UserEncryptionKey,
          `${TableName.UserEncryptionKey}.userId`,
          `${TableName.Users}.id`
        )
        .select(
          selectAllTableCols(TableName.ProjectMembership),
          db.ref("id").withSchema(TableName.Users).as("userId"),
          db.ref("username").withSchema(TableName.Users)
        )
        .whereIn("username", usernames)
        .where({ isGhost: false });
      return members.map(({ userId, username, ...data }) => ({
        ...data,
        user: { id: userId, username }
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find members by email" });
    }
  };

  const findProjectMembershipsByUserId = async (orgId: string, userId: string) => {
    try {
      const memberships = await db(TableName.ProjectMembership)
        .where({ userId })
        .join(TableName.Project, `${TableName.ProjectMembership}.projectId`, `${TableName.Project}.id`)
        .where({ [`${TableName.Project}.orgId` as "orgId"]: orgId })
        .select(selectAllTableCols(TableName.ProjectMembership));

      return memberships;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project memberships by user id" });
    }
  };

  return {
    ...projectMembershipOrm,
    findAllProjectMembers,
    delete: deleteMany,
    findProjectGhostUser,
    findMembershipsByUsername,
    findProjectMembershipsByUserId
  };
};
