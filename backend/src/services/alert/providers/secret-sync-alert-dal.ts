import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TSecretSyncWithLocation = {
  syncId: string;
  syncName: string;
  destination: string;
  connectionId: string;
  folderId: string | null;
  orgId: string;
  projectId: string;
  envSlug: string | null;
  envName: string | null;
};

export type TSecretSyncAlertDALFactory = ReturnType<typeof secretSyncAlertDALFactory>;

export const secretSyncAlertDALFactory = (db: TDbClient) => {
  // Reads the primary: the event path treats an empty result as terminal, and the create form adds a sync's
  // alert right after creating the sync, so a lagging replica would leave that alert's audit log without the
  // sync's name. The folder is a left join because deleting a sync's folder keeps the sync (folderId is SET
  // NULL), and its next run fails, which is exactly what the alert reports.
  const $syncsWithProject = (syncIds: string[]) =>
    db(TableName.SecretSync)
      .whereIn(`${TableName.SecretSync}.id`, syncIds)
      .join(TableName.Project, `${TableName.SecretSync}.projectId`, `${TableName.Project}.id`)
      .leftJoin(TableName.SecretFolder, `${TableName.SecretSync}.folderId`, `${TableName.SecretFolder}.id`)
      .leftJoin(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`);

  const findSyncsByIds = async (syncIds: string[]): Promise<TSecretSyncWithLocation[]> => {
    if (syncIds.length === 0) return [];
    try {
      return (await $syncsWithProject(syncIds)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(
          db.ref("id").withSchema(TableName.SecretSync).as("syncId"),
          db.ref("name").withSchema(TableName.SecretSync).as("syncName"),
          db.ref("destination").withSchema(TableName.SecretSync).as("destination"),
          db.ref("connectionId").withSchema(TableName.SecretSync).as("connectionId"),
          db.ref("folderId").withSchema(TableName.SecretSync).as("folderId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("id").withSchema(TableName.Project).as("projectId"),
          db.ref("orgId").withSchema(TableName.Project).as("orgId")
        )) as TSecretSyncWithLocation[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSecretSyncsByIds" });
    }
  };

  const findSyncNamesByIds = async (syncIds: string[], orgId: string): Promise<{ id: string; name: string }[]> => {
    if (syncIds.length === 0) return [];
    try {
      return (await $syncsWithProject(syncIds)
        .where(`${TableName.Project}.orgId`, orgId)
        .select(`${TableName.SecretSync}.id`, `${TableName.SecretSync}.name`)) as {
        id: string;
        name: string;
      }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSecretSyncNamesByIds" });
    }
  };

  return { findSyncsByIds, findSyncNamesByIds };
};
