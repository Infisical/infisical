import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TReminderSecret = {
  secretId: string;
  secretKey: string;
  secretType: string;
  folderId: string;
  orgId: string;
  projectId: string;
  envSlug: string;
  envName: string;
  tagSlugs: string[];
};

export type TSecretReminderAlertDALFactory = ReturnType<typeof secretReminderAlertDALFactory>;

export const secretReminderAlertDALFactory = (db: TDbClient) => {
  // Reads the primary: the event path treats an empty result as terminal, and a reminder can fire in
  // the same run that the secret was written.
  const findReminderSecrets = async (secretIds: string[]): Promise<TReminderSecret[]> => {
    if (secretIds.length === 0) return [];
    try {
      const rows = (await db(TableName.SecretV2)
        .whereIn(`${TableName.SecretV2}.id`, secretIds)
        .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
        .whereNull(`${TableName.Environment}.deleteAfter`)
        .whereNull(`${TableName.Project}.deleteAfter`)
        .select(
          db.ref("id").withSchema(TableName.SecretV2).as("secretId"),
          db.ref("key").withSchema(TableName.SecretV2).as("secretKey"),
          db.ref("type").withSchema(TableName.SecretV2).as("secretType"),
          db.ref("folderId").withSchema(TableName.SecretV2).as("folderId"),
          db.ref("slug").withSchema(TableName.Environment).as("envSlug"),
          db.ref("name").withSchema(TableName.Environment).as("envName"),
          db.ref("id").withSchema(TableName.Project).as("projectId"),
          db.ref("orgId").withSchema(TableName.Project).as("orgId")
        )) as Omit<TReminderSecret, "tagSlugs">[];
      if (rows.length === 0) return [];

      const tags = (await db(TableName.SecretV2JnTag)
        .whereIn(
          `${TableName.SecretV2JnTag}.${TableName.SecretV2}Id`,
          rows.map((row) => row.secretId)
        )
        .join(TableName.SecretTag, `${TableName.SecretV2JnTag}.${TableName.SecretTag}Id`, `${TableName.SecretTag}.id`)
        .select(
          db.ref(`${TableName.SecretV2}Id`).withSchema(TableName.SecretV2JnTag).as("secretId"),
          db.ref("slug").withSchema(TableName.SecretTag).as("slug")
        )) as { secretId: string; slug: string }[];

      return rows.map((row) => ({
        ...row,
        tagSlugs: tags.filter((tag) => tag.secretId === row.secretId).map((tag) => tag.slug)
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "Find reminder secrets" });
    }
  };

  const primaryNode = () => db.primaryNode();

  return { findReminderSecrets, primaryNode };
};
