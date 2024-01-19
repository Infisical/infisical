import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TIdentityProjectDALFactory = ReturnType<typeof identityProjectDALFactory>;

export const identityProjectDALFactory = (db: TDbClient) => {
  const identityProjectOrm = ormify(db, TableName.IdentityProjectMembership);

  const findByProjectId = async (projectId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db)(TableName.IdentityProjectMembership)
        .where(`${TableName.IdentityProjectMembership}.projectId`, projectId)
        .join(
          TableName.Identity,
          `${TableName.IdentityProjectMembership}.identityId`,
          `${TableName.Identity}.id`
        )
        .leftJoin(
          TableName.ProjectRoles,
          `${TableName.IdentityProjectMembership}.roleId`,
          `${TableName.ProjectRoles}.id`
        )
        .select(selectAllTableCols(TableName.IdentityProjectMembership))
        // cr stands for custom role
        .select(db.ref("id").as("crId").withSchema(TableName.ProjectRoles))
        .select(db.ref("name").as("crName").withSchema(TableName.ProjectRoles))
        .select(db.ref("slug").as("crSlug").withSchema(TableName.ProjectRoles))
        .select(db.ref("description").as("crDescription").withSchema(TableName.ProjectRoles))
        .select(db.ref("permissions").as("crPermission").withSchema(TableName.ProjectRoles))
        .select(db.ref("permissions").as("crPermission").withSchema(TableName.ProjectRoles))
        .select(db.ref("id").as("identityId").withSchema(TableName.Identity))
        .select(db.ref("name").as("identityName").withSchema(TableName.Identity))
        .select(db.ref("authMethod").as("identityAuthMethod").withSchema(TableName.Identity));
      return docs.map(
        ({
          crId,
          crDescription,
          crSlug,
          crPermission,
          crName,
          identityId,
          identityName,
          identityAuthMethod,
          ...el
        }) => ({
          ...el,
          identityId,
          identity: {
            id: identityId,
            name: identityName,
            authMethod: identityAuthMethod
          },
          customRole: el.roleId
            ? {
                id: crId,
                name: crName,
                slug: crSlug,
                permissions: crPermission,
                description: crDescription
              }
            : undefined
        })
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByProjectId" });
    }
  };

  return { ...identityProjectOrm, findByProjectId };
};
