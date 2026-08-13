import { TDbClient } from "@app/db";
import { TableName, TSandboxes } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSandboxDALFactory = ReturnType<typeof sandboxDALFactory>;

export const sandboxDALFactory = (db: TDbClient) => {
  const sandboxOrm = ormify(db, TableName.Sandbox);

  const findByOrg = async (orgId: string): Promise<TSandboxes[]> =>
    db.replicaNode()(TableName.Sandbox).where({ orgId }).orderBy("createdAt", "desc").select("*");

  /**
   * Everything `infisical pam db access` needs: it addresses accounts by name, not by id.
   *
   * An account groups under a folder and takes its database type from a template. `pam_resources`
   * is the pre-revamp shape and is empty, so joining it dropped every account and the sandbox
   * started believing no database was granted.
   */
  const findPamAccountTargets = async (accountIds: string[]) => {
    if (!accountIds.length) return [];

    return db
      .replicaNode()(TableName.PamAccount)
      .leftJoin(TableName.PamFolder, `${TableName.PamFolder}.id`, `${TableName.PamAccount}.folderId`)
      .leftJoin(
        TableName.PamAccountTemplate,
        `${TableName.PamAccountTemplate}.id`,
        `${TableName.PamAccount}.templateId`
      )
      .whereIn(`${TableName.PamAccount}.id`, accountIds)
      .select(
        db.ref("id").withSchema(TableName.PamAccount).as("accountId"),
        db.ref("name").withSchema(TableName.PamAccount).as("accountName"),
        db.ref("projectId").withSchema(TableName.PamAccount).as("projectId"),
        db.ref("name").withSchema(TableName.PamFolder).as("resourceName"),
        db.ref("type").withSchema(TableName.PamAccountTemplate).as("resourceType")
      );
  };

  const findBySlackConversation = async (
    channelId: string,
    threadTs: string | null
  ): Promise<TSandboxes | undefined> => {
    if (threadTs) {
      const threaded = await db
        .replicaNode()(TableName.Sandbox)
        .where({ slackChannelId: channelId, slackThreadTs: threadTs })
        .first();
      if (threaded) return threaded;
    }

    return db.replicaNode()(TableName.Sandbox).where({ slackChannelId: channelId }).whereNull("slackThreadTs").first();
  };

  return { ...sandboxOrm, findByOrg, findPamAccountTargets, findBySlackConversation };
};
