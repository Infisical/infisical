import { TDbClient } from "@app/db";
import { ProjectsSchema, TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

export type TProjectDalFactory = ReturnType<typeof projectDalFactory>;

export const projectDalFactory = (db: TDbClient) => {
  const projectOrm = ormify(db, TableName.Project);

  const findAllProjects = async (userId: string) => {
    try {
      const workspaces = await db(TableName.ProjectMembership)
        .where({ userId })
        .join(
          TableName.Project,
          `${TableName.ProjectMembership}.projectId`,
          `${TableName.Project}.id`
        )
        .join(
          TableName.Environment,
          `${TableName.Environment}.projectId`,
          `${TableName.Project}.id`
        )
        .select(
          selectAllTableCols(TableName.Project),
          db.ref("id").withSchema(TableName.Project).as("_id"),
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName")
        )
        .orderBy("createdAt", "asc", "last");
      return sqlNestRelationships({
        data: workspaces,
        key: "id",
        parentMapper: ({ _id, ...el }) => ({ _id, ...ProjectsSchema.parse(el) }),
        childrenMapper: [
          {
            key: "envId",
            label: "environments" as const,
            mapper: ({ envId: id, envSlug: slug, envName: name }) => ({
              id,
              slug,
              name
            })
          }
        ]
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all projects" });
    }
  };

  const findProjectById = async (id: string) => {
    try {
      const workspaces = await db(TableName.ProjectMembership)
        .where(`${TableName.Project}.id`, id)
        .join(
          TableName.Project,
          `${TableName.ProjectMembership}.projectId`,
          `${TableName.Project}.id`
        )
        .join(
          TableName.Environment,
          `${TableName.Environment}.projectId`,
          `${TableName.Project}.id`
        )
        .select(
          selectAllTableCols(TableName.Project),
          db.ref("id").withSchema(TableName.Project).as("_id"),
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName")
        );
      return sqlNestRelationships({
        data: workspaces,
        key: "id",
        parentMapper: ({ _id, ...el }) => ({ _id, ...ProjectsSchema.parse(el) }),
        childrenMapper: [
          {
            key: "envId",
            label: "environments" as const,
            mapper: ({ envId, envSlug: slug, envName: name }) => ({
              id: envId,
              slug,
              name
            })
          }
        ]
      })?.[0];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all projects" });
    }
  };

  return {
    ...projectOrm,
    findAllProjects,
    findProjectById
  };
};
