import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  AccessScope,
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
import { sanitizeSqlLikeString } from "@app/lib/fn";
import {
  buildFindFilter,
  ormify,
  selectAllTableCols,
  sqlNestRelationships,
  TFindFilter,
  TFindOpt
} from "@app/lib/knex";

import { ActorType } from "../auth/auth-type";
import { Filter, ProjectFilterType, SearchProjectSortBy } from "./project-types";

export type TProjectDALFactory = ReturnType<typeof projectDALFactory>;

export const projectDALFactory = (db: TDbClient) => {
  const projectOrm = ormify(db, TableName.Project);

  // Soft-deleted projects (deleteAfter set) must be hidden from every read path. We override the
  // ormify base reads so indirect callers can't accidentally surface a pending-deletion project,
  // and expose explicit *IncludingExpired escape hatches for the restore + hard-delete worker.
  const findById: typeof projectOrm.findById = async (id, tx) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.Project)
        .where({ id })
        .whereNull("deleteAfter")
        .first("*");
      return result;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id" });
    }
  };

  const findOne: typeof projectOrm.findOne = async (filter, tx) => {
    try {
      const res = await (tx || db.replicaNode())(TableName.Project).where(filter).whereNull("deleteAfter").first("*");
      return res;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find one" });
    }
  };

  const find = (async (filter: TFindFilter<TProjects>, { offset, limit, sort, tx }: TFindOpt<TProjects> = {}) => {
    try {
      const query = (tx || db.replicaNode())(TableName.Project)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter(filter))
        .whereNull("deleteAfter");
      if (limit) void query.limit(limit);
      if (offset) void query.offset(offset);
      if (sort) {
        void query.orderBy(sort.map(([column, order, nulls]) => ({ column: column as string, order, nulls })));
      }
      const res = await query;
      return res as TProjects[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find" });
    }
  }) as typeof projectOrm.find;

  // Bypasses the soft-delete read filter — restore + hard-delete worker only.
  const findByIdIncludingExpired = async (id: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.Project).where({ id }).first("*");
      return result as TProjects | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find by id including expired" });
    }
  };

  // Raw find that includes soft-deleted rows. Used by the hard-delete worker's KMS shared-key
  // check so a *second* pending-deletion project sharing a key still counts as a referencer.
  const findIncludingExpired = projectOrm.find;

  const softDeleteById = async (
    id: string,
    update: {
      deleteAfter: Date;
      softDeletedAt: Date;
      deletedByUserId: string | null;
      deletedByIdentityId: string | null;
      slug: string;
    },
    tx?: Knex
  ) => {
    try {
      const [doc] = await (tx || db)(TableName.Project)
        .where({ id })
        .whereNull("deleteAfter")
        .update(update)
        .returning("*");
      return doc as TProjects | undefined;
    } catch (error) {
      throw new DatabaseError({ error, name: "Soft delete project" });
    }
  };

  // Count of projects awaiting hard delete (deleteAfter set). Backs the observability gauge — if this
  // climbs and stays high, the async worker's drain rate (concurrency + rate limiter) isn't keeping up
  // and needs tuning, or a mass-delete event is in progress. Uses the partial idx_projects_delete_after.
  const countPendingHardDelete = async (tx?: Knex) => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.Project).whereNotNull("deleteAfter").count();
      return Number(doc?.[0]?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count pending hard delete" });
    }
  };

  const findExpiredForHardDelete = async (limit: number, tx?: Knex) => {
    try {
      const rows = await (tx || db.replicaNode())(TableName.Project)
        .whereNotNull("deleteAfter")
        .andWhere("deleteAfter", "<=", new Date())
        .orderBy("deleteAfter", "asc")
        .limit(limit)
        .select("*");
      return rows as TProjects[];
    } catch (error) {
      throw new DatabaseError({ error, name: "Find expired projects for hard delete" });
    }
  };

  // Chunked delete of a project's secret_versions_v2 rows ahead of the final cascade. This table
  // is the largest project-scoped table and has NO FK on folderId/secretId (only a mostly-NULL
  // envId cascade), so the project-delete cascade otherwise orphans ~all of its version rows.
  // Deleting by folderId is FK-safe (no inbound RESTRICT FK; snapshot_secrets_v2.secretVersionId
  // is ON DELETE CASCADE). Each batch is its own transaction so a crash just leaves fewer rows for
  // the next run (idempotent/resumable). statement_timeout is SET LOCAL so it can't leak to pooled
  // connections.
  const hardDeleteProjectSecretVersionsInBatches = async (
    projectId: string,
    batchSize: number,
    statementTimeoutMs: number,
    interBatchSleepMs: number
  ) => {
    let totalDeleted = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const deletedCount = await db.transaction(async (tx): Promise<number> => {
        await tx.raw(`SET LOCAL statement_timeout = ${statementTimeoutMs}`);
        const folderIdsSubquery = tx(TableName.SecretFolder)
          .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
          .where(`${TableName.Environment}.projectId`, projectId)
          .select(`${TableName.SecretFolder}.id`);
        const idsToDelete = tx(TableName.SecretVersionV2)
          .whereIn("folderId", folderIdsSubquery)
          .select("id")
          .limit(batchSize);
        const deleted = await tx(TableName.SecretVersionV2).whereIn("id", idsToDelete).delete();
        return deleted;
      });
      totalDeleted += deletedCount;
      if (deletedCount < batchSize) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, interBatchSleepMs + Math.floor(Math.random() * interBatchSleepMs));
      });
    }
    return totalDeleted;
  };

  const findIdentityProjects = async (identityId: string, orgId: string, projectType?: ProjectType) => {
    try {
      const identityGroupSubquery = db
        .replicaNode()(TableName.Groups)
        .leftJoin(
          TableName.IdentityGroupMembership,
          `${TableName.IdentityGroupMembership}.groupId`,
          `${TableName.Groups}.id`
        )
        .where(`${TableName.IdentityGroupMembership}.identityId`, identityId)
        .select(db.ref("id").withSchema(TableName.Groups));

      const workspaces = await db
        .replicaNode()(TableName.Membership)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .join(TableName.Project, `${TableName.Membership}.scopeProjectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .andWhere((qb) => {
          void qb
            .where(`${TableName.Membership}.actorIdentityId`, identityId)
            .orWhereIn(`${TableName.Membership}.actorGroupId`, identityGroupSubquery);
        })
        .andWhere((qb) => {
          if (projectType) {
            void qb.where(`${TableName.Project}.type`, projectType);
          }
        })
        .leftJoin(TableName.Environment, function joinActiveEnvByProject() {
          this.on(`${TableName.Environment}.projectId`, `${TableName.Project}.id`).andOnNull(
            `${TableName.Environment}.deleteAfter`
          );
        })
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
      const userGroupSubquery = db
        .replicaNode()(TableName.Groups)
        .leftJoin(TableName.UserGroupMembership, `${TableName.UserGroupMembership}.groupId`, `${TableName.Groups}.id`)
        .where(`${TableName.UserGroupMembership}.userId`, userId)
        .select(db.ref("id").withSchema(TableName.Groups));

      const projects = await db
        .replicaNode()(TableName.Membership)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .join(TableName.Project, `${TableName.Membership}.scopeProjectId`, `${TableName.Project}.id`)
        .where(`${TableName.Project}.orgId`, orgId)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .andWhere((qb) => {
          void qb
            .where(`${TableName.Membership}.actorUserId`, userId)
            .orWhereIn(`${TableName.Membership}.actorGroupId`, userGroupSubquery);
        })
        .andWhere((qb) => {
          if (projectType) {
            void qb.where(`${TableName.Project}.type`, projectType);
          }
        })
        .leftJoin(TableName.Environment, function joinActiveEnvByProject() {
          this.on(`${TableName.Environment}.projectId`, `${TableName.Project}.id`).andOnNull(
            `${TableName.Environment}.deleteAfter`
          );
        })
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

      const formattedProjects = sqlNestRelationships({
        data: projects,
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

      return formattedProjects.map((workspace) => ({
        ...workspace,
        organization: workspace.orgId
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find all projects" });
    }
  };

  // Lightweight variant of findUserProjects/findIdentityProjects that returns only the
  // project IDs the actor has direct or group-based project membership on. Skips the
  // Project/Environment joins + sqlNestRelationships hydration used by the full variants,
  // for hot paths that need permission scoping but don't need the project rows themselves.
  const findActorAccessibleProjectIds = async (
    actorId: string,
    actorType: ActorType,
    orgId: string,
    tx?: Knex
  ): Promise<string[]> => {
    try {
      if (actorType !== ActorType.USER && actorType !== ActorType.IDENTITY) {
        return [];
      }
      const isUser = actorType === ActorType.USER;
      const groupMembershipTable = isUser ? TableName.UserGroupMembership : TableName.IdentityGroupMembership;
      const groupMembershipActorColumn = isUser ? "userId" : "identityId";
      const actorColumn = isUser ? "actorUserId" : "actorIdentityId";

      const groupSubquery = (tx || db.replicaNode())(TableName.Groups)
        .leftJoin(groupMembershipTable, `${groupMembershipTable}.groupId`, `${TableName.Groups}.id`)
        .where(`${groupMembershipTable}.${groupMembershipActorColumn}`, actorId)
        .select(db.ref("id").withSchema(TableName.Groups));

      const rows = await (tx || db.replicaNode())(TableName.Membership)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .where(`${TableName.Membership}.scopeOrgId`, orgId)
        .whereNotNull(`${TableName.Membership}.scopeProjectId`)
        .join(TableName.Project, `${TableName.Membership}.scopeProjectId`, `${TableName.Project}.id`)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .andWhere((qb) => {
          void qb
            .where(`${TableName.Membership}.${actorColumn}`, actorId)
            .orWhereIn(`${TableName.Membership}.actorGroupId`, groupSubquery);
        })
        .distinct<{ scopeProjectId: string }[]>(`${TableName.Membership}.scopeProjectId`);

      return rows.map((r) => r.scopeProjectId);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find actor accessible project ids" });
    }
  };

  // Lightweight all-projects-in-org lookup that returns only the IDs.
  const findOrgProjectIds = async (orgId: string, tx?: Knex): Promise<string[]> => {
    try {
      const rows = await (tx || db.replicaNode())(TableName.Project)
        .where({ orgId })
        .whereNull("deleteAfter")
        .select("id");
      return rows.map((r) => r.id);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find org project ids" });
    }
  };

  const findProjectGhostUser = async (projectId: string, tx?: Knex) => {
    try {
      const ghostUser = await (tx || db.replicaNode())(TableName.Membership)
        .where(`${TableName.Membership}.scope`, AccessScope.Project)
        .where(`${TableName.Membership}.scopeProjectId`, projectId)
        .join(TableName.Users, `${TableName.Membership}.actorUserId`, `${TableName.Users}.id`)
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

  const findProjectById = async (id: string) => {
    try {
      const workspaces = await db
        .replicaNode()(TableName.Project)
        .where(`${TableName.Project}.id`, id)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .leftJoin(TableName.Environment, function joinActiveEnvByProject() {
          this.on(`${TableName.Environment}.projectId`, `${TableName.Project}.id`).andOnNull(
            `${TableName.Environment}.deleteAfter`
          );
        })
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
        .whereNull(`${TableName.Project}.deleteAfter`)
        .leftJoin(TableName.Environment, function joinActiveEnvByProject() {
          this.on(`${TableName.Environment}.projectId`, `${TableName.Project}.id`).andOnNull(
            `${TableName.Environment}.deleteAfter`
          );
        })
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
      .whereNull(`${TableName.Project}.deleteAfter`)
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
    projectIds?: string[];
  }) => {
    const { limit = 20, offset = 0, sortBy = SearchProjectSortBy.NAME, sortDir = SortDirection.ASC } = dto;
    const groupMembershipSubquery = db(TableName.Groups)
      .leftJoin(TableName.UserGroupMembership, `${TableName.UserGroupMembership}.groupId`, `${TableName.Groups}.id`)
      .where(`${TableName.UserGroupMembership}.userId`, dto.actorId)
      .select(db.ref("id").withSchema(TableName.Groups));

    const identityGroupMembershipSubquery = db
      .replicaNode()(TableName.Groups)
      .leftJoin(
        TableName.IdentityGroupMembership,
        `${TableName.IdentityGroupMembership}.groupId`,
        `${TableName.Groups}.id`
      )
      .where(`${TableName.IdentityGroupMembership}.identityId`, dto.actorId)
      .select(db.ref("id").withSchema(TableName.Groups));

    const membershipSubQuery = db(TableName.Membership)
      .where(`${TableName.Membership}.scope`, AccessScope.Project)
      .where((qb) => {
        if (dto.actor === ActorType.IDENTITY) {
          void qb
            .where(`${TableName.Membership}.actorIdentityId`, dto.actorId)
            .orWhereIn(`${TableName.Membership}.actorGroupId`, identityGroupMembershipSubquery);
        } else {
          void qb
            .where(`${TableName.Membership}.actorUserId`, dto.actorId)
            .orWhereIn(`${TableName.Membership}.actorGroupId`, groupMembershipSubquery);
        }
      })
      .select("scopeProjectId");

    // Get the SQL strings for the subqueries
    const membershipSQL = membershipSubQuery.toQuery();

    const query = db
      .replicaNode()(TableName.Project)
      .where(`${TableName.Project}.orgId`, dto.orgId)
      .whereNull(`${TableName.Project}.deleteAfter`)
      .select(selectAllTableCols(TableName.Project))
      .select(db.raw("COUNT(*) OVER() AS count"))
      .select<(TProjects & { isMember: boolean; count: number })[]>(
        db.raw(
          `
                  CASE
                    WHEN ${TableName.Project}.id IN (?) THEN TRUE
                    ELSE FALSE
                  END as "isMember"
                `,
          [db.raw(membershipSQL)]
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
      void query.whereILike(`${TableName.Project}.name`, `%${sanitizeSqlLikeString(dto.name)}%`);
    }

    if (dto.projectIds?.length) {
      void query.whereIn(`${TableName.Project}.id`, dto.projectIds);
    }

    const docs = await query;

    return { docs, totalCount: Number(docs?.[0]?.count ?? 0) };
  };

  const findProjectByEnvId = async (envId: string, tx?: Knex) => {
    const project = await (tx || db.replicaNode())(TableName.Project)
      .leftJoin(TableName.Environment, function joinActiveEnvByProject() {
        this.on(`${TableName.Environment}.projectId`, `${TableName.Project}.id`).andOnNull(
          `${TableName.Environment}.deleteAfter`
        );
      })
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      .where(buildFindFilter({ id: envId }, TableName.Environment))
      .whereNull(`${TableName.Project}.deleteAfter`)
      .select(selectAllTableCols(TableName.Project))
      .first();
    return project;
  };

  const findProjectDeletedEnvironments = async (projectId: string, tx?: Knex) => {
    try {
      type DeletedEnvironmentRow = {
        id: string;
        slug: string;
        name: string;
        deleteAfter: Date;
        softDeletedAt: Date;
        deletedByUserId: string | null;
        deletedByIdentityId: string | null;
        deletedByUserEmail: string | null;
        deletedByUserUsername: string | null;
        deletedByUserFirstName: string | null;
        deletedByUserLastName: string | null;
        deletedByIdentityName: string | null;
      };

      const rows = (await (tx || db.replicaNode())(TableName.Environment)
        .leftJoin(TableName.Users, `${TableName.Environment}.deletedByUserId`, `${TableName.Users}.id`)
        .leftJoin(TableName.Identity, `${TableName.Environment}.deletedByIdentityId`, `${TableName.Identity}.id`)
        .where(`${TableName.Environment}.projectId`, projectId)
        .whereNotNull(`${TableName.Environment}.deleteAfter`)
        .whereNotNull(`${TableName.Environment}.softDeletedAt`)
        .select(
          `${TableName.Environment}.id`,
          `${TableName.Environment}.slug`,
          `${TableName.Environment}.name`,
          `${TableName.Environment}.deleteAfter`,
          `${TableName.Environment}.softDeletedAt`,
          `${TableName.Environment}.deletedByUserId`,
          `${TableName.Environment}.deletedByIdentityId`,
          db.ref("email").withSchema(TableName.Users).as("deletedByUserEmail"),
          db.ref("username").withSchema(TableName.Users).as("deletedByUserUsername"),
          db.ref("firstName").withSchema(TableName.Users).as("deletedByUserFirstName"),
          db.ref("lastName").withSchema(TableName.Users).as("deletedByUserLastName"),
          db.ref("name").withSchema(TableName.Identity).as("deletedByIdentityName")
        )
        .orderBy(`${TableName.Environment}.position`, "asc")) as DeletedEnvironmentRow[];

      return rows.map((row) => {
        let deletedBy:
          | {
              type: "user";
              id: string;
              email: string | null;
              username: string | null;
              firstName: string | null;
              lastName: string | null;
            }
          | { type: "identity"; id: string; name: string }
          | null = null;

        if (row.deletedByUserId) {
          deletedBy = {
            type: "user",
            id: row.deletedByUserId,
            email: row.deletedByUserEmail,
            username: row.deletedByUserUsername,
            firstName: row.deletedByUserFirstName,
            lastName: row.deletedByUserLastName
          };
        } else if (row.deletedByIdentityId) {
          deletedBy = {
            type: "identity",
            id: row.deletedByIdentityId,
            name: row.deletedByIdentityName ?? ""
          };
        }

        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          deleteAfter: row.deleteAfter,
          softDeletedAt: row.softDeletedAt,
          deletedBy
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project deleted environments" });
    }
  };

  const countOfOrgProjects = async (orgId: string | null, tx?: Knex) => {
    try {
      const subOrgProjects = db.replicaNode()(TableName.Organization).where({ rootOrgId: orgId }).select("id");

      const doc = await (tx || db.replicaNode())(TableName.Project)
        .whereNull("deleteAfter")
        .andWhere((bd) => {
          if (orgId) {
            void bd.where({ orgId }).orWhereIn("orgId", subOrgProjects);
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
    findById,
    findOne,
    find,
    findByIdIncludingExpired,
    findIncludingExpired,
    softDeleteById,
    countPendingHardDelete,
    findExpiredForHardDelete,
    hardDeleteProjectSecretVersionsInBatches,
    findUserProjects,
    findIdentityProjects,
    findActorAccessibleProjectIds,
    findOrgProjectIds,
    setProjectUpgradeStatus,
    findProjectGhostUser,
    findProjectById,
    findProjectByFilter,
    findProjectBySlug,
    findProjectWithOrg,
    checkProjectUpgradeStatus,
    searchProjects,
    findProjectByEnvId,
    findProjectDeletedEnvironments,
    countOfOrgProjects
  };
};
