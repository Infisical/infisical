import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  ProjectsSchema,
  ProjectType,
  ProjectUpgradeStatus,
  ProjectVersion,
  SortDirection,
  TableName,
  TProjects,
  TProjectsUpdate
} from "@app/db/schemas";
import { BadRequestError, DatabaseError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";

import { ActorType } from "../auth/auth-type";
import { Filter, ProjectFilterType, SearchProjectSortBy } from "./project-types";

export type TProjectDALFactory = ReturnType<typeof projectDALFactory>;

export const projectDALFactory = (db: TDbClient) => {
  const projectOrm = ormify(db, TableName.Project);

  const findIdentityProjects = async (identityId: string, orgId: string, projectType?: ProjectType) => {
    try {
      const workspaces = await db(TableName.IdentityProjectMembership)
        .where({ identityId })
        .join(TableName.Project, `${TableName.IdentityProjectMembership}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .andWhere((qb) => {
          if (projectType) {
            void qb.where(`${TableName.Project}.type`, projectType);
          }
        })
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
      throw new DatabaseError({ error, name: "Find identity projects" });
    }
  };

  const findUserProjects = async (userId: string, orgId: string, projectType?: ProjectType) => {
    try {
      const workspaces = await db
        .replicaNode()(TableName.ProjectMembership)
        .where({ userId })
        .join(TableName.Project, `${TableName.ProjectMembership}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .andWhere((qb) => {
          if (projectType) {
            void qb.where(`${TableName.Project}.type`, projectType);
          }
        })
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

      const groups = db(TableName.UserGroupMembership).where({ userId }).select("groupId");

      const groupWorkspaces = await db(TableName.GroupProjectMembership)
        .whereIn("groupId", groups)
        .join(TableName.Project, `${TableName.GroupProjectMembership}.projectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .andWhere((qb) => {
          if (projectType) {
            void qb.where(`${TableName.Project}.type`, projectType);
          }
        })
        .whereNotIn(
          `${TableName.Project}.id`,
          workspaces.map(({ id }) => id)
        )
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
        data: workspaces.concat(groupWorkspaces),
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

  const findProjectGhostUser = async (projectId: string, tx?: Knex) => {
    try {
      const ghostUser = await (tx || db.replicaNode())(TableName.ProjectMembership)
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

  const findAllProjectsByIdentity = async (identityId: string, projectType?: ProjectType) => {
    try {
      const workspaces = await db
        .replicaNode()(TableName.IdentityProjectMembership)
        .where({ identityId })
        .join(TableName.Project, `${TableName.IdentityProjectMembership}.projectId`, `${TableName.Project}.id`)
        .andWhere((qb) => {
          if (projectType) {
            void qb.where(`${TableName.Project}.type`, projectType);
          }
        })
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
      const workspaces = await db
        .replicaNode()(TableName.Project)
        .where(`${TableName.Project}.id`, id)
        .leftJoin(TableName.Environment, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .select(
          selectAllTableCols(TableName.Project),
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName")
        )
        .orderBy([
          { column: `${TableName.Project}.name`, order: "asc" },
          { column: `${TableName.Environment}.position`, order: "asc" }
        ]);

      const project = sqlNestRelationships({
        data: workspaces,
        key: "id",
        parentMapper: ({ ...el }) => ({ _id: el.id, ...ProjectsSchema.parse(el) }),
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

      if (!project) {
        throw new NotFoundError({ message: `Project with ID '${id}' not found` });
      }

      return project;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }

      throw new DatabaseError({ error, name: "Find all projects" });
    }
  };

  const findProjectBySlug = async (slug: string, orgId: string | undefined) => {
    try {
      if (!orgId) {
        throw new UnauthorizedError({ message: "Organization ID is required when querying with slugs" });
      }

      const projects = await db
        .replicaNode()(TableName.Project)
        .where(`${TableName.Project}.slug`, slug)
        .where(`${TableName.Project}.orgId`, orgId)
        .leftJoin(TableName.Environment, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .select(
          selectAllTableCols(TableName.Project),
          db.ref("id").withSchema(TableName.Environment).as("envId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName")
        )
        .orderBy([
          { column: `${TableName.Project}.name`, order: "asc" },
          { column: `${TableName.Environment}.position`, order: "asc" }
        ]);

      const project = sqlNestRelationships({
        data: projects,
        key: "id",
        parentMapper: ({ ...el }) => ({ _id: el.id, ...ProjectsSchema.parse(el) }),
        childrenMapper: [
          {
            key: "envId",
            label: "environments" as const,
            mapper: ({ envId, envSlug, envName: name }) => ({
              id: envId,
              slug: envSlug,
              name
            })
          }
        ]
      })?.[0];

      if (!project) {
        throw new NotFoundError({ message: `Project with slug '${slug}' not found` });
      }

      return project;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
        throw error;
      }

      throw new DatabaseError({ error, name: "Find project by slug" });
    }
  };

  const findProjectByFilter = async (filter: Filter) => {
    try {
      if (filter.type === ProjectFilterType.ID) {
        return await findProjectById(filter.projectId);
      }
      if (filter.type === ProjectFilterType.SLUG) {
        if (!filter.orgId) {
          throw new UnauthorizedError({
            message: "Organization ID is required when querying with slugs"
          });
        }

        return await findProjectBySlug(filter.slug, filter.orgId);
      }
      throw new BadRequestError({ message: "Invalid filter type" });
    } catch (error) {
      if (error instanceof BadRequestError || error instanceof NotFoundError || error instanceof UnauthorizedError) {
        throw error;
      }
      throw new DatabaseError({ error, name: `Failed to find project by ${filter.type}` });
    }
  };

  const checkProjectUpgradeStatus = async (projectId: string) => {
    const project = await projectOrm.findById(projectId);
    const upgradeInProgress =
      project.upgradeStatus === ProjectUpgradeStatus.InProgress && project.version === ProjectVersion.V1;

    if (upgradeInProgress) {
      throw new BadRequestError({
        message: "Project is currently being upgraded, and secrets cannot be written. Please try again"
      });
    }
  };

  const findProjectWithOrg = async (projectId: string) => {
    // we just need the project, and we need to include a new .organization field that includes the org from the orgId reference

    const project = await db(TableName.Project)
      .where({ [`${TableName.Project}.id` as "id"]: projectId })

      .join(TableName.Organization, `${TableName.Organization}.id`, `${TableName.Project}.orgId`)

      .select(
        db.ref("id").withSchema(TableName.Organization).as("organizationId"),
        db.ref("name").withSchema(TableName.Organization).as("organizationName")
      )
      .select(selectAllTableCols(TableName.Project))
      .first();

    if (!project) {
      throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
    }

    return {
      ...ProjectsSchema.parse(project),
      organization: {
        id: project.organizationId,
        name: project.organizationName
      }
    };
  };

  const searchProjects = async (dto: {
    orgId: string;
    actor: ActorType;
    actorId: string;
    type?: ProjectType;
    limit?: number;
    offset?: number;
    name?: string;
    sortBy?: SearchProjectSortBy;
    sortDir?: SortDirection;
  }) => {
    const { limit = 20, offset = 0, sortBy = SearchProjectSortBy.NAME, sortDir = SortDirection.ASC } = dto;

    const userMembershipSubquery = db(TableName.ProjectMembership).where({ userId: dto.actorId }).select("projectId");
    const groups = db(TableName.UserGroupMembership).where({ userId: dto.actorId }).select("groupId");
    const groupMembershipSubquery = db(TableName.GroupProjectMembership).whereIn("groupId", groups).select("projectId");

    const identityMembershipSubQuery = db(TableName.IdentityProjectMembership)
      .where({ identityId: dto.actorId })
      .select("projectId");

    // Get the SQL strings for the subqueries
    const userMembershipSql = userMembershipSubquery.toQuery();
    const groupMembershipSql = groupMembershipSubquery.toQuery();
    const identityMembershipSql = identityMembershipSubQuery.toQuery();

    const query = db
      .replicaNode()(TableName.Project)
      .where(`${TableName.Project}.orgId`, dto.orgId)
      .select(selectAllTableCols(TableName.Project))
      .select(db.raw("COUNT(*) OVER() AS count"))
      .select<(TProjects & { isMember: boolean; count: number })[]>(
        dto.actor === ActorType.USER
          ? db.raw(
              `
          CASE
            WHEN ${TableName.Project}.id IN (?) THEN TRUE
            WHEN ${TableName.Project}.id IN (?) THEN TRUE
            ELSE FALSE
          END as "isMember"
        `,
              [db.raw(userMembershipSql), db.raw(groupMembershipSql)]
            )
          : db.raw(
              `
          CASE
            WHEN ${TableName.Project}.id IN (?) THEN TRUE
            ELSE FALSE
          END as "isMember"
        `,
              [db.raw(identityMembershipSql)]
            )
      )
      .limit(limit)
      .offset(offset);
    if (sortBy === SearchProjectSortBy.NAME) {
      void query.orderBy([{ column: `${TableName.Project}.name`, order: sortDir }]);
    }

    if (dto.type) {
      void query.where(`${TableName.Project}.type`, dto.type);
    }
    if (dto.name) {
      void query.whereILike(`${TableName.Project}.name`, `%${dto.name}%`);
    }
    const docs = await query;

    return { docs, totalCount: Number(docs?.[0]?.count ?? 0) };
  };

  const findProjectByEnvId = async (envId: string, tx?: Knex) => {
    const project = await (tx || db.replicaNode())(TableName.Project)
      .leftJoin(TableName.Environment, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      .where(buildFindFilter({ id: envId }, TableName.Environment))
      .select(selectAllTableCols(TableName.Project))
      .first();
    return project;
  };

  const countOfOrgProjects = async (orgId: string | null, tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.Project)
        .andWhere((bd) => {
          if (orgId) {
            void bd.where({ orgId });
          }
        })
        .count();
      return Number(doc?.[0]?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count of Org Projects" });
    }
  };

  return {
    ...projectOrm,
    findUserProjects,
    findIdentityProjects,
    setProjectUpgradeStatus,
    findAllProjectsByIdentity,
    findProjectGhostUser,
    findProjectById,
    findProjectByFilter,
    findProjectBySlug,
    findProjectWithOrg,
    checkProjectUpgradeStatus,
    searchProjects,
    findProjectByEnvId,
    countOfOrgProjects
  };
};
