import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TProjectAccessRequestDALFactory = ReturnType<typeof projectAccessRequestDALFactory>;

export const projectAccessRequestDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.ProjectAccessRequest);

  const findPendingForRequesterInOrg = async (requesterUserId: string, orgId: string) => {
    return db
      .replicaNode()(TableName.ProjectAccessRequest)
      .join(TableName.Project, `${TableName.Project}.id`, `${TableName.ProjectAccessRequest}.projectId`)
      .where(`${TableName.ProjectAccessRequest}.requesterUserId`, requesterUserId)
      .where(`${TableName.ProjectAccessRequest}.status`, "pending")
      .where(`${TableName.Project}.orgId`, orgId)
      .select<{ projectId: string; createdAt: Date }[]>(
        `${TableName.ProjectAccessRequest}.projectId`,
        `${TableName.ProjectAccessRequest}.createdAt`
      );
  };

  const findPendingForProject = async (projectId: string, requesterUserId?: string) => {
    try {
      const query = db
        .replicaNode()(TableName.ProjectAccessRequest)
        .where(`${TableName.ProjectAccessRequest}.projectId`, projectId)
        .where(`${TableName.ProjectAccessRequest}.status`, "pending");
      if (requesterUserId) {
        void query.where(`${TableName.ProjectAccessRequest}.requesterUserId`, requesterUserId);
      }
      return await query
        .select<{ id: string; requesterUserId: string; comment: string | null; createdAt: Date }[]>(
          `${TableName.ProjectAccessRequest}.id`,
          `${TableName.ProjectAccessRequest}.requesterUserId`,
          `${TableName.ProjectAccessRequest}.comment`,
          `${TableName.ProjectAccessRequest}.createdAt`
        )
        .orderBy(`${TableName.ProjectAccessRequest}.createdAt`, "desc");
    } catch (error) {
      throw new DatabaseError({ error, name: "FindPendingProjectAccessRequestsForProject" });
    }
  };

  const upsertPendingRequest = async ({
    projectId,
    requesterUserId,
    comment
  }: {
    projectId: string;
    requesterUserId: string;
    comment: string | null;
  }) => {
    try {
      const [row] = await db(TableName.ProjectAccessRequest)
        .insert({ projectId, requesterUserId, status: "pending", comment })
        .onConflict(["projectId", "requesterUserId"])
        .merge({ status: "pending", comment, createdAt: db.fn.now() } as never)
        .returning("*");
      return row;
    } catch (error) {
      throw new DatabaseError({ error, name: "UpsertPendingProjectAccessRequest" });
    }
  };

  return { ...orm, findPendingForRequesterInOrg, findPendingForProject, upsertPendingRequest };
};
