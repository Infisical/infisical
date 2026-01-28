import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TProjectTemplateIdentityMembershipDALFactory = ReturnType<
  typeof projectTemplateIdentityMembershipDALFactory
>;

export const projectTemplateIdentityMembershipDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ProjectTemplateIdentityMembership);

  // Find all identity memberships for a template with identity info
  const findByTemplateId = async (projectTemplateId: string, tx?: Knex) => {
    const docs = await (tx || db.replicaNode())(TableName.ProjectTemplateIdentityMembership)
      .where(`${TableName.ProjectTemplateIdentityMembership}.projectTemplateId`, projectTemplateId)
      .join(TableName.Identity, `${TableName.ProjectTemplateIdentityMembership}.identityId`, `${TableName.Identity}.id`)
      .select(selectAllTableCols(TableName.ProjectTemplateIdentityMembership))
      .select(db.ref("name").withSchema(TableName.Identity).as("identityName"));

    return docs.map((doc) => ({
      id: doc.id,
      projectTemplateId: doc.projectTemplateId,
      identityId: doc.identityId,
      identityName: doc.identityName,
      roles: doc.roles,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt
    }));
  };

  return { ...orm, findByTemplateId };
};
