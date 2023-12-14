import { TDbClient } from "@app/db";
import { TableName,TProjects } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { mergeOneToManyRelation, ormify } from "@app/lib/knex";

export type TProjectDalFactory = ReturnType<typeof projectDalFactory>;

export const projectDalFactory = (db: TDbClient) => {
  const projectOrm = ormify(db, TableName.Project);

  const findAllProjects = async (
    userId: string
  ): Promise<(TProjects & { environments: { id: string; slug: string; name: string }[] })[]> => {
    try {
      const workspaces = await db(TableName.ProjectMembership)
        .where({ userId })
        .join(
          TableName.Environment,
          `${TableName.Environment}.projectId`,
          `${TableName.Project}.id`
        )
        .join(
          TableName.Project,
          `${TableName.ProjectMembership}.projectId`,
          `${TableName.Project}.id`
        )
        .select(
          db.ref("id").withSchema(TableName.Project),
          db.ref("name").withSchema(TableName.Project),
          db.ref("autoCapitalization").withSchema(TableName.Project),
          db.ref("orgId").withSchema(TableName.Project),
          db.ref("createdAt").withSchema(TableName.Project),
          db.ref("updatedAt").withSchema(TableName.Project),
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName")
        )
        .orderBy("createdAt", "asc", "last");
      return mergeOneToManyRelation(
        workspaces,
        "id",
        ({ envId, envSlug, envName, ...data }) => data,
        ({ envName, envSlug, envId }) => ({ id: envId, slug: envSlug, name: envName }),
        "environments"
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all projects" });
    }
  };

  const findProjectById = async (
    id: string
  ): Promise<
    (TProjects & { environments: { id: string; slug: string; name: string }[] }) | undefined
  > => {
    try {
      const workspaces = await db(TableName.ProjectMembership)
        .where(`${TableName.Project}.id`, id)
        .join(
          TableName.Environment,
          `${TableName.Environment}.projectId`,
          `${TableName.Project}.id`
        )
        .join(
          TableName.Project,
          `${TableName.ProjectMembership}.projectId`,
          `${TableName.Project}.id`
        )
        .select(
          db.ref("id").withSchema(TableName.Project),
          db.ref("name").withSchema(TableName.Project),
          db.ref("autoCapitalization").withSchema(TableName.Project),
          db.ref("orgId").withSchema(TableName.Project),
          db.ref("createdAt").withSchema(TableName.Project),
          db.ref("updatedAt").withSchema(TableName.Project),
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName")
        );
      const [doc] = mergeOneToManyRelation(
        workspaces,
        "id",
        ({ envId, envSlug, envName, ...data }) => data,
        ({ envName, envSlug, envId }) => ({ id: envId, slug: envSlug, name: envName }),
        "environments"
      );
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all projects" });
    }
  };

  const findAllProjectUserPubKeys = async (projectId: string) => {
    try {
      const pubKeys = await db(TableName.ProjectMembership)
        .where({ projectId })
        .join(TableName.Users, `${TableName.ProjectMembership}.userId`, `${TableName.Users}.id`)
        .join(
          TableName.UserEncryptionKey,
          `${TableName.Users}.id`,
          `${TableName.UserEncryptionKey}.userId`
        )
        .select("userId", "publicKey");
      return pubKeys;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all workspace pub keys" });
    }
  };

  return {
    ...projectOrm,
    findAllProjects,
    findProjectById,
    findAllProjectUserPubKeys
  };
};
