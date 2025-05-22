import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  TableName,
  TFolderCommitChanges,
  TFolderCommits,
  TProjectEnvironments,
  TSecretFolderVersions,
  TSecretVersionsV2
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols } from "@app/lib/knex";

export type TFolderCommitChangesDALFactory = ReturnType<typeof folderCommitChangesDALFactory>;

export type CommitChangeWithCommitInfo = TFolderCommitChanges & {
  actorMetadata: unknown;
  actorType: string;
  message?: string | null;
  folderId: string;
  folderName?: string;
  folderVersion?: string;
  secretKey?: string;
  secretVersion?: string;
  secretId?: string;
  folderChangeId?: string;
  objectType?: string;
  versions?: {
    secretKey?: string;
    secretComment?: string;
    skipMultilineEncoding?: boolean | null;
    secretReminderRepeatDays?: number | null;
    secretReminderNote?: string | null;
    metadata?: unknown;
    tags?: string[] | null;
    secretReminderRecipients?: string[] | null;
    secretValue?: string;
    name?: string;
  }[];
};

export const folderCommitChangesDALFactory = (db: TDbClient) => {
  const folderCommitChangesOrm = ormify(db, TableName.FolderCommitChanges);

  const findByCommitId = async (
    folderCommitId: string,
    projectId: string,
    tx?: Knex
  ): Promise<CommitChangeWithCommitInfo[]> => {
    try {
      const docs = await (tx || db.replicaNode())<TFolderCommitChanges>(TableName.FolderCommitChanges)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ folderCommitId }, TableName.FolderCommitChanges))
        .leftJoin<TFolderCommits>(
          TableName.FolderCommit,
          `${TableName.FolderCommitChanges}.folderCommitId`,
          `${TableName.FolderCommit}.id`
        )
        .leftJoin<TSecretVersionsV2>(
          TableName.SecretVersionV2,
          `${TableName.FolderCommitChanges}.secretVersionId`,
          `${TableName.SecretVersionV2}.id`
        )
        .leftJoin<TSecretFolderVersions>(
          TableName.SecretFolderVersion,
          `${TableName.FolderCommitChanges}.folderVersionId`,
          `${TableName.SecretFolderVersion}.id`
        )
        .leftJoin<TProjectEnvironments>(
          TableName.Environment,
          `${TableName.FolderCommit}.envId`,
          `${TableName.Environment}.id`
        )
        .where((qb) => {
          if (projectId) {
            void qb.where(`${TableName.Environment}.projectId`, "=", projectId);
          }
        })
        .select(selectAllTableCols(TableName.FolderCommitChanges))
        .select(
          db.ref("name").withSchema(TableName.SecretFolderVersion).as("folderName"),
          db.ref("folderId").withSchema(TableName.SecretFolderVersion).as("folderChangeId"),
          db.ref("version").withSchema(TableName.SecretFolderVersion).as("folderVersion"),
          db.ref("key").withSchema(TableName.SecretVersionV2).as("secretKey"),
          db.ref("version").withSchema(TableName.SecretVersionV2).as("secretVersion"),
          db.ref("secretId").withSchema(TableName.SecretVersionV2),
          db.ref("actorMetadata").withSchema(TableName.FolderCommit),
          db.ref("actorType").withSchema(TableName.FolderCommit),
          db.ref("message").withSchema(TableName.FolderCommit),
          db.ref("createdAt").withSchema(TableName.FolderCommit),
          db.ref("folderId").withSchema(TableName.FolderCommit)
        );
      return docs.map((doc) => ({
        ...doc,
        folderVersion: doc.folderVersion?.toString(),
        secretVersion: doc.secretVersion?.toString()
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByCommitId" });
    }
  };

  const findBySecretVersionId = async (secretVersionId: string, tx?: Knex): Promise<CommitChangeWithCommitInfo[]> => {
    try {
      const docs = await (tx || db.replicaNode())<
        TFolderCommitChanges &
          Pick<TFolderCommits, "actorMetadata" | "actorType" | "message" | "createdAt" | "folderId">
      >(TableName.FolderCommitChanges)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ secretVersionId }, TableName.FolderCommitChanges))
        .select(selectAllTableCols(TableName.FolderCommitChanges))
        .join(TableName.FolderCommit, `${TableName.FolderCommitChanges}.folderCommitId`, `${TableName.FolderCommit}.id`)
        .select(
          db.ref("actorMetadata").withSchema(TableName.FolderCommit),
          db.ref("actorType").withSchema(TableName.FolderCommit),
          db.ref("message").withSchema(TableName.FolderCommit),
          db.ref("createdAt").withSchema(TableName.FolderCommit),
          db.ref("folderId").withSchema(TableName.FolderCommit)
        );
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindBySecretVersionId" });
    }
  };

  const findByFolderVersionId = async (folderVersionId: string, tx?: Knex): Promise<CommitChangeWithCommitInfo[]> => {
    try {
      const docs = await (tx || db.replicaNode())<
        TFolderCommitChanges &
          Pick<TFolderCommits, "actorMetadata" | "actorType" | "message" | "createdAt" | "folderId">
      >(TableName.FolderCommitChanges)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ folderVersionId }, TableName.FolderCommitChanges))
        .select(selectAllTableCols(TableName.FolderCommitChanges))
        .join(TableName.FolderCommit, `${TableName.FolderCommitChanges}.folderCommitId`, `${TableName.FolderCommit}.id`)
        .select(
          db.ref("actorMetadata").withSchema(TableName.FolderCommit),
          db.ref("actorType").withSchema(TableName.FolderCommit),
          db.ref("message").withSchema(TableName.FolderCommit),
          db.ref("createdAt").withSchema(TableName.FolderCommit),
          db.ref("folderId").withSchema(TableName.FolderCommit)
        );
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByFolderVersionId" });
    }
  };

  return {
    ...folderCommitChangesOrm,
    findByCommitId,
    findBySecretVersionId,
    findByFolderVersionId
  };
};
