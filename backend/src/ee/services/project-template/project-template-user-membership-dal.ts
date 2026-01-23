import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TProjectTemplateUserMembershipDALFactory = ReturnType<typeof projectTemplateUserMembershipDALFactory>;

export const projectTemplateUserMembershipDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ProjectTemplateUserMembership);

  // Find all user memberships for a template with user info
  const findByTemplateId = async (projectTemplateId: string, tx?: Knex) => {
    const docs = await (tx || db.replicaNode())(TableName.ProjectTemplateUserMembership)
      .where(`${TableName.ProjectTemplateUserMembership}.projectTemplateId`, projectTemplateId)
      .join(
        TableName.Membership,
        `${TableName.ProjectTemplateUserMembership}.membershipId`,
        `${TableName.Membership}.id`
      )
      .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
      .select(selectAllTableCols(TableName.ProjectTemplateUserMembership))
      .select(
        db.ref("id").withSchema(TableName.Users).as("userId"),
        db.ref("username").withSchema(TableName.Users),
        db.ref("email").withSchema(TableName.Users),
        db.ref("firstName").withSchema(TableName.Users),
        db.ref("lastName").withSchema(TableName.Users)
      );

    return docs.map((doc) => ({
      id: doc.id,
      projectTemplateId: doc.projectTemplateId,
      membershipId: doc.membershipId,
      userId: doc.userId,
      username: doc.username,
      email: doc.email,
      firstName: doc.firstName,
      lastName: doc.lastName,
      roles: doc.roles,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }));
  };

  return { ...orm, findByTemplateId };
};
