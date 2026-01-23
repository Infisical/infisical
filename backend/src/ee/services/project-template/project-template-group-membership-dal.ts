import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TProjectTemplateGroupMembershipDALFactory = ReturnType<typeof projectTemplateGroupMembershipDALFactory>;

export const projectTemplateGroupMembershipDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ProjectTemplateGroupMembership);

  // Find all group memberships for a template with group info
  const findByTemplateId = async (projectTemplateId: string, tx?: Knex) => {
    const docs = await (tx || db.replicaNode())(TableName.ProjectTemplateGroupMembership)
      .where(`${TableName.ProjectTemplateGroupMembership}.projectTemplateId`, projectTemplateId)
      .join(TableName.Groups, `${TableName.ProjectTemplateGroupMembership}.groupId`, `${TableName.Groups}.id`)
      .select(selectAllTableCols(TableName.ProjectTemplateGroupMembership))
      .select(
        db.ref("slug").withSchema(TableName.Groups).as("groupSlug"),
        db.ref("name").withSchema(TableName.Groups).as("groupName")
      );

    return docs.map((doc) => ({
      id: doc.id,
      projectTemplateId: doc.projectTemplateId,
      groupId: doc.groupId,
      groupSlug: doc.groupSlug,
      groupName: doc.groupName,
      roles: doc.roles,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }));
  };

  return { ...orm, findByTemplateId };
};
