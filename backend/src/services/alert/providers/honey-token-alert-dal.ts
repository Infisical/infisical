import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type THoneyTokenWithLocation = {
  honeyTokenId: string;
  honeyTokenName: string;
  honeyTokenType: string;
  honeyTokenStatus: string;
  folderId: string;
  orgId: string;
  projectId: string;
  envSlug: string;
  envName: string;
};

export type THoneyTokenAlertDALFactory = ReturnType<typeof honeyTokenAlertDALFactory>;

export const honeyTokenAlertDALFactory = (db: TDbClient) => {
  const $honeyTokensWithProject = (honeyTokenIds: string[]) =>
    db(TableName.HoneyToken)
      .whereIn(`${TableName.HoneyToken}.id`, honeyTokenIds)
      .join(TableName.SecretFolder, `${TableName.HoneyToken}.folderId`, `${TableName.SecretFolder}.id`)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`);

  const findHoneyTokensByIds = async (honeyTokenIds: string[]): Promise<THoneyTokenWithLocation[]> => {
    if (honeyTokenIds.length === 0) return [];
    try {
      return (await $honeyTokensWithProject(honeyTokenIds)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(
          db.ref("id").withSchema(TableName.HoneyToken).as("honeyTokenId"),
          db.ref("name").withSchema(TableName.HoneyToken).as("honeyTokenName"),
          db.ref("type").withSchema(TableName.HoneyToken).as("honeyTokenType"),
          db.ref("status").withSchema(TableName.HoneyToken).as("honeyTokenStatus"),
          db.ref("id").withSchema(TableName.SecretFolder).as("folderId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("id").withSchema(TableName.Project).as("projectId"),
          db.ref("orgId").withSchema(TableName.Project).as("orgId")
        )) as THoneyTokenWithLocation[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindHoneyTokensByIds" });
    }
  };

  const findHoneyTokenNamesByIds = async (
    honeyTokenIds: string[],
    orgId: string
  ): Promise<{ id: string; name: string }[]> => {
    if (honeyTokenIds.length === 0) return [];
    try {
      return (await $honeyTokensWithProject(honeyTokenIds)
        .where(`${TableName.Project}.orgId`, orgId)
        .select(`${TableName.HoneyToken}.id`, `${TableName.HoneyToken}.name`)) as { id: string; name: string }[];
    } catch (error) {
      throw new DatabaseError({ error, name: "FindHoneyTokenNamesByIds" });
    }
  };

  return { findHoneyTokensByIds, findHoneyTokenNamesByIds };
};
