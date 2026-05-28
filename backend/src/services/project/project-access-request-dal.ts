import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
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
      .select<
        { projectId: string; createdAt: Date }[]
      >(`${TableName.ProjectAccessRequest}.projectId`, `${TableName.ProjectAccessRequest}.createdAt`);
  };

  return { ...orm, findPendingForRequesterInOrg };
};
