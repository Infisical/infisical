import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { ProjectsSchema, ProjectUpgradeStatus, ProjectVersion, TableName, TProjectsUpdate } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

export type TProjectDALFactory = ReturnType<typeof projectDALFactory>;

export const projectDALFactory = (db: TDbClient) => {
  const projectOrm = ormify(db, TableName.Project);

  const findAllProjects = async (userId: string) => {
    try {
      const workspaces = await db(TableName.ProjectMembership)
        .where({ userId })
        .join(TableName.Project, `${TableName.ProjectMembership}.projectId`, `${TableName.Project}.id`)
        .leftJoin(TableName.Environment, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .select(
          selectAllTableCols(TableName.Project),
          db.ref("id").withSchema(TableName.Project).as("_id"),
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName")
        )
        .orderBy([
          { column: `${TableName.Project}.name`, order: "asc" },
          { column: `${TableName.Environment}.position`, order: "asc" }
        ]);

      const nestedWorkspaces = sqlNestRelationships({
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

      return nestedWorkspaces.map((workspace) => ({
        ...workspace,
        organization: workspace.orgId
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all projects" });
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

  const setProjectUpgradeStatus = async (projectId: string, status: ProjectUpgradeStatus | null, tx?: Knex) => {
    try {
      const data: TProjectsUpdate = {
        upgradeStatus: status
      } as const;

      await (tx || db)(TableName.Project).where({ id: projectId }).update(data);
    } catch (error) {
      throw new DatabaseError({ error, name: "Set project upgrade status" });
    }
  };

  const findAllProjectsByIdentity = async (identityId: string) => {
    try {
      const workspaces = await db(TableName.IdentityProjectMembership)
        .where({ identityId })
        .join(TableName.Project, `${TableName.IdentityProjectMembership}.projectId`, `${TableName.Project}.id`)
        .leftJoin(TableName.Environment, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .select(
          selectAllTableCols(TableName.Project),
          db.ref("id").withSchema(TableName.Project).as("_id"),
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName")
        )
        .orderBy("createdAt", "asc", "last");

      const nestedWorkspaces = sqlNestRelationships({
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

      // We need to add the organization field, as it's required for one of our API endpoint responses.
      return nestedWorkspaces.map((workspace) => ({
        ...workspace,
        organization: workspace.orgId
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all projects by identity" });
    }
  };

  const findProjectById = async (id: string) => {
    try {
      const workspaces = await db(TableName.ProjectMembership)
        .where(`${TableName.Project}.id`, id)
        .join(TableName.Project, `${TableName.ProjectMembership}.projectId`, `${TableName.Project}.id`)
        .join(TableName.Environment, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .select(
          selectAllTableCols(TableName.Project),
          db.ref("id").withSchema(TableName.Project).as("_id"),
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName")
        )
        .orderBy([
          { column: `${TableName.Project}.name`, order: "asc" },
          { column: `${TableName.Environment}.position`, order: "asc" }
        ]);
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

  const isProjectBeingUpgraded = async (projectId: string) => {
    const project = await projectOrm.findById(projectId);
    return project.upgradeStatus === ProjectUpgradeStatus.InProgress && project.version === ProjectVersion.V1;
  };

  return {
    ...projectOrm,
    findAllProjects,
    setProjectUpgradeStatus,
    findAllProjectsByIdentity,
    findProjectGhostUser,
    findProjectById,
    isProjectBeingUpgraded
  };
};
