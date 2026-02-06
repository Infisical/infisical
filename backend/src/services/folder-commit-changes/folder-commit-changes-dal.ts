/* eslint-disable @typescript-eslint/no-misused-promises */
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

// Base type with common fields
type BaseCommitChangeInfo = TFolderCommitChanges & {
  actorMetadata: unknown;
  actorType: string;
  message?: string | null;
  folderId: string;
  createdAt: Date;
};

// Secret-specific change
export type SecretCommitChange = BaseCommitChangeInfo & {
  resourceType: "secret";
  secretKey: string;
  changeType: string;
  secretVersionId?: string | null;
  secretVersion: string;
  secretId: string;
  versions?: {
    secretKey: string;
    secretComment: string;
    skipMultilineEncoding?: boolean | null;
    secretReminderRepeatDays?: number | null;
    secretReminderNote?: string | null;
    metadata?: unknown;
    tags?: string[] | null;
    secretReminderRecipients?: string[] | null;
    secretValue: string;
    isRedacted: boolean;
    redactedAt: Date | null;
    redactedByUserId: string | null;
  }[];
};

// Folder-specific change
export type FolderCommitChange = BaseCommitChangeInfo & {
  resourceType: "folder";
  folderName: string;
  folderVersion: string;
  folderChangeId: string;
  versions?: {
    version: string;
    name?: string;
  }[];
};

// Discriminated union
export type CommitChangeWithCommitInfo = SecretCommitChange | FolderCommitChange;

// Type guards
export const isSecretCommitChange = (change: CommitChangeWithCommitInfo): change is SecretCommitChange =>
  change.resourceType === "secret";

export const isFolderCommitChange = (change: CommitChangeWithCommitInfo): change is FolderCommitChange =>
  change.resourceType === "folder";

export const folderCommitChangesDALFactory = (db: TDbClient) => {
  const folderCommitChangesOrm = ormify(db, TableName.FolderCommitChanges);

  const findByCommitId = async (
    folderCommitId: string,
    projectId: string,
    tx?: Knex
  ): Promise<CommitChangeWithCommitInfo[]> => {
    try {
      const docs = await (tx || db.replicaNode())<TFolderCommitChanges>(TableName.FolderCommitChanges)
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

      return docs.map((doc) => {
        // Determine if this is a secret or folder change based on populated fields
        if (doc.secretKey && doc.secretVersion !== null && doc.secretId) {
          return {
            ...doc,
            resourceType: "secret",
            secretKey: doc.secretKey,
            secretVersion: doc.secretVersion.toString(),
            secretId: doc.secretId
          } as SecretCommitChange;
        }
        return {
          ...doc,
          resourceType: "folder",
          folderName: doc.folderName,
          folderVersion: doc.folderVersion.toString(),
          folderChangeId: doc.folderChangeId
        } as FolderCommitChange;
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByCommitId" });
    }
  };

  const findBySecretVersionId = async (secretVersionId: string, tx?: Knex): Promise<SecretCommitChange[]> => {
    try {
      const docs = await (tx || db.replicaNode())<
        TFolderCommitChanges &
          Pick<TFolderCommits, "actorMetadata" | "actorType" | "message" | "createdAt" | "folderId">
      >(TableName.FolderCommitChanges)
        .where(buildFindFilter({ secretVersionId }, TableName.FolderCommitChanges))
        .select(selectAllTableCols(TableName.FolderCommitChanges))
        .join(TableName.FolderCommit, `${TableName.FolderCommitChanges}.folderCommitId`, `${TableName.FolderCommit}.id`)
        .leftJoin<TSecretVersionsV2>(
          TableName.SecretVersionV2,
          `${TableName.FolderCommitChanges}.secretVersionId`,
          `${TableName.SecretVersionV2}.id`
        )
        .select(
          db.ref("actorMetadata").withSchema(TableName.FolderCommit),
          db.ref("actorType").withSchema(TableName.FolderCommit),
          db.ref("message").withSchema(TableName.FolderCommit),
          db.ref("createdAt").withSchema(TableName.FolderCommit),
          db.ref("folderId").withSchema(TableName.FolderCommit),
          db.ref("key").withSchema(TableName.SecretVersionV2).as("secretKey"),
          db.ref("version").withSchema(TableName.SecretVersionV2).as("secretVersion"),
          db.ref("secretId").withSchema(TableName.SecretVersionV2)
        );

      return docs
        .filter((doc) => doc.secretKey && doc.secretVersion !== null && doc.secretId)
        .map(
          (doc): SecretCommitChange => ({
            ...doc,
            resourceType: "secret",
            secretKey: doc.secretKey,
            secretVersion: doc.secretVersion.toString(),
            secretId: doc.secretId
          })
        );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindBySecretVersionId" });
    }
  };

  const findByFolderVersionId = async (folderVersionId: string, tx?: Knex): Promise<FolderCommitChange[]> => {
    try {
      const docs = await (tx || db.replicaNode())<
        TFolderCommitChanges &
          Pick<TFolderCommits, "actorMetadata" | "actorType" | "message" | "createdAt" | "folderId">
      >(TableName.FolderCommitChanges)
        .where(buildFindFilter({ folderVersionId }, TableName.FolderCommitChanges))
        .select(selectAllTableCols(TableName.FolderCommitChanges))
        .join(TableName.FolderCommit, `${TableName.FolderCommitChanges}.folderCommitId`, `${TableName.FolderCommit}.id`)
        .leftJoin<TSecretFolderVersions>(
          TableName.SecretFolderVersion,
          `${TableName.FolderCommitChanges}.folderVersionId`,
          `${TableName.SecretFolderVersion}.id`
        )
        .select(
          db.ref("actorMetadata").withSchema(TableName.FolderCommit),
          db.ref("actorType").withSchema(TableName.FolderCommit),
          db.ref("message").withSchema(TableName.FolderCommit),
          db.ref("createdAt").withSchema(TableName.FolderCommit),
          db.ref("folderId").withSchema(TableName.FolderCommit),
          db.ref("name").withSchema(TableName.SecretFolderVersion).as("folderName"),
          db.ref("folderId").withSchema(TableName.SecretFolderVersion).as("folderChangeId"),
          db.ref("version").withSchema(TableName.SecretFolderVersion).as("folderVersion")
        );

      return docs
        .filter((doc) => doc.folderName && doc.folderVersion !== null && doc.folderChangeId)
        .map(
          (doc): FolderCommitChange => ({
            ...doc,
            resourceType: "folder",
            folderName: doc.folderName,
            folderVersion: doc.folderVersion!.toString(),
            folderChangeId: doc.folderChangeId
          })
        );
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
