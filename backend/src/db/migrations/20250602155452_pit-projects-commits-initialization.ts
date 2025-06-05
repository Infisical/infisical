import { Knex } from "knex";

import { chunkArray } from "@app/lib/fn";
import { selectAllTableCols } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { ChangeType } from "@app/services/folder-commit/folder-commit-service";

import {
  ProjectType,
  SecretType,
  TableName,
  TFolderCheckpoints,
  TFolderCommits,
  TFolderTreeCheckpoints,
  TSecretFolders
} from "../schemas";

const sortFoldersByHierarchy = (folders: TSecretFolders[]) => {
  // Create a map for quick lookup of children by parent ID
  const childrenMap = new Map<string, TSecretFolders[]>();

  // Set of all folder IDs
  const allFolderIds = new Set<string>();

  // Build the set of all folder IDs
  folders.forEach((folder) => {
    if (folder.id) {
      allFolderIds.add(folder.id);
    }
  });

  // Group folders by their parentId
  folders.forEach((folder) => {
    if (folder.parentId) {
      const children = childrenMap.get(folder.parentId) || [];
      children.push(folder);
      childrenMap.set(folder.parentId, children);
    }
  });

  // Find root folders - those with no parentId or with a parentId that doesn't exist
  const rootFolders = folders.filter((folder) => !folder.parentId || !allFolderIds.has(folder.parentId));

  // Process each level of the hierarchy
  const result = [];
  let currentLevel = rootFolders;

  while (currentLevel.length > 0) {
    result.push(...currentLevel);

    const nextLevel = [];
    for (const folder of currentLevel) {
      if (folder.id) {
        const children = childrenMap.get(folder.id) || [];
        nextLevel.push(...children);
      }
    }

    currentLevel = nextLevel;
  }

  return result.reverse();
};

const getSecretsByFolderIds = async (knex: Knex, folderIds: string[]): Promise<Record<string, string[]>> => {
  const secrets = await knex(TableName.SecretV2)
    .whereIn(`${TableName.SecretV2}.folderId`, folderIds)
    .where(`${TableName.SecretV2}.type`, SecretType.Shared)
    .join<TableName.SecretVersionV2>(TableName.SecretVersionV2, (queryBuilder) => {
      void queryBuilder
        .on(`${TableName.SecretVersionV2}.secretId`, `${TableName.SecretV2}.id`)
        .andOn(`${TableName.SecretVersionV2}.version`, `${TableName.SecretV2}.version`);
    })
    .select(selectAllTableCols(TableName.SecretV2))
    .select(knex.ref("id").withSchema(TableName.SecretVersionV2).as("secretVersionId"));

  const secretsMap: Record<string, string[]> = {};

  secrets.forEach((secret) => {
    if (!secretsMap[secret.folderId]) {
      secretsMap[secret.folderId] = [];
    }
    secretsMap[secret.folderId].push(secret.secretVersionId);
  });

  return secretsMap;
};

const getFoldersByParentIds = async (knex: Knex, parentIds: string[]): Promise<Record<string, string[]>> => {
  const folders = await knex(TableName.SecretFolder)
    .whereIn(`${TableName.SecretFolder}.parentId`, parentIds)
    .where(`${TableName.SecretFolder}.isReserved`, false)
    .join<TableName.SecretFolderVersion>(TableName.SecretFolderVersion, (queryBuilder) => {
      void queryBuilder
        .on(`${TableName.SecretFolderVersion}.folderId`, `${TableName.SecretFolder}.id`)
        .andOn(`${TableName.SecretFolderVersion}.version`, `${TableName.SecretFolder}.version`);
    })
    .select(selectAllTableCols(TableName.SecretFolder))
    .select(knex.ref("id").withSchema(TableName.SecretFolderVersion).as("folderVersionId"));

  const foldersMap: Record<string, string[]> = {};

  folders.forEach((folder) => {
    if (!folder.parentId) {
      return;
    }
    if (!foldersMap[folder.parentId]) {
      foldersMap[folder.parentId] = [];
    }
    foldersMap[folder.parentId].push(folder.folderVersionId);
  });

  return foldersMap;
};

export async function up(knex: Knex): Promise<void> {
  logger.info("Initializing folder commits");
  const hasFolderCommitTable = await knex.schema.hasTable(TableName.FolderCommit);
  if (hasFolderCommitTable) {
    // Get Projects to Initialize
    const projects = await knex(TableName.Project)
      .where(`${TableName.Project}.version`, 3)
      .where(`${TableName.Project}.type`, ProjectType.SecretManager)
      .select(selectAllTableCols(TableName.Project));
    logger.info(`Found ${projects.length} projects to initialize`);

    // Process Projects in batches of 100
    const batches = chunkArray(projects, 100);
    let i = 0;
    for (const batch of batches) {
      i += 1;
      logger.info(`Processing project batch ${i} of ${batches.length}`);
      let foldersCommitsList = [];

      const rootFoldersMap: Record<string, string> = {};
      const envRootFoldersMap: Record<string, string> = {};

      // Get All Folders for the Project
      // eslint-disable-next-line no-await-in-loop
      const folders = await knex(TableName.SecretFolder)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .whereIn(
          `${TableName.Environment}.projectId`,
          batch.map((project) => project.id)
        )
        .where(`${TableName.SecretFolder}.isReserved`, false)
        .select(selectAllTableCols(TableName.SecretFolder));
      logger.info(`Found ${folders.length} folders to initialize in project batch ${i} of ${batches.length}`);

      // Sort Folders by Hierarchy (parents before nested folders)
      const sortedFolders = sortFoldersByHierarchy(folders);

      // eslint-disable-next-line no-await-in-loop
      const folderSecretsMap = await getSecretsByFolderIds(
        knex,
        sortedFolders.map((folder) => folder.id)
      );
      // eslint-disable-next-line no-await-in-loop
      const folderFoldersMap = await getFoldersByParentIds(
        knex,
        sortedFolders.map((folder) => folder.id)
      );

      // Get folder commit changes
      for (const folder of sortedFolders) {
        const subFolderVersionIds = folderFoldersMap[folder.id];
        const secretVersionIds = folderSecretsMap[folder.id];
        const changes = [];
        if (subFolderVersionIds) {
          changes.push(
            ...subFolderVersionIds.map((folderVersionId) => ({
              folderId: folder.id,
              changeType: ChangeType.ADD,
              secretVersionId: undefined,
              folderVersionId,
              isUpdate: false
            }))
          );
        }
        if (secretVersionIds) {
          changes.push(
            ...secretVersionIds.map((secretVersionId) => ({
              folderId: folder.id,
              changeType: ChangeType.ADD,
              secretVersionId,
              folderVersionId: undefined,
              isUpdate: false
            }))
          );
        }
        if (changes.length > 0) {
          const folderCommit = {
            commit: {
              actorMetadata: {},
              actorType: ActorType.PLATFORM,
              message: "Initialized folder",
              folderId: folder.id,
              envId: folder.envId
            },
            changes
          };
          foldersCommitsList.push(folderCommit);
          if (!folder.parentId) {
            rootFoldersMap[folder.id] = folder.envId;
            envRootFoldersMap[folder.envId] = folder.id;
          }
        }
      }
      logger.info(`Retrieved folder changes for project batch ${i} of ${batches.length}`);

      const filteredBrokenProjectFolders: string[] = [];

      foldersCommitsList = foldersCommitsList.filter((folderCommit) => {
        if (!envRootFoldersMap[folderCommit.commit.envId]) {
          filteredBrokenProjectFolders.push(folderCommit.commit.folderId);
          return false;
        }
        return true;
      });

      logger.info(
        `Filtered ${filteredBrokenProjectFolders.length} broken project folders: ${JSON.stringify(filteredBrokenProjectFolders)}`
      );

      // Insert New Commits in batches of 9000
      const newCommits = foldersCommitsList.map((folderCommit) => folderCommit.commit);
      const commitBatches = chunkArray(newCommits, 9000);

      let j = 0;
      for (const commitBatch of commitBatches) {
        j += 1;
        logger.info(`Inserting folder commits - batch ${j} of ${commitBatches.length}`);
        // Create folder commit
        // eslint-disable-next-line no-await-in-loop
        const newCommitsInserted = (await knex
          .batchInsert(TableName.FolderCommit, commitBatch)
          .returning("*")) as TFolderCommits[];

        logger.info(`Finished inserting folder commits - batch ${j} of ${commitBatches.length}`);

        const newCommitsMap: Record<string, string> = {};
        const newCommitsMapInverted: Record<string, string> = {};
        const newCheckpointsMap: Record<string, string> = {};
        newCommitsInserted.forEach((commit) => {
          newCommitsMap[commit.folderId] = commit.id;
          newCommitsMapInverted[commit.id] = commit.folderId;
        });

        // Create folder checkpoints
        // eslint-disable-next-line no-await-in-loop
        const newCheckpoints = (await knex
          .batchInsert(
            TableName.FolderCheckpoint,
            Object.values(newCommitsMap).map((commitId) => ({
              folderCommitId: commitId
            }))
          )
          .returning("*")) as TFolderCheckpoints[];

        logger.info(`Finished inserting folder checkpoints - batch ${j} of ${commitBatches.length}`);

        newCheckpoints.forEach((checkpoint) => {
          newCheckpointsMap[newCommitsMapInverted[checkpoint.folderCommitId]] = checkpoint.id;
        });

        // Create folder commit changes
        // eslint-disable-next-line no-await-in-loop
        await knex.batchInsert(
          TableName.FolderCommitChanges,
          foldersCommitsList
            .map((folderCommit) => folderCommit.changes)
            .flat()
            .map((change) => ({
              folderCommitId: newCommitsMap[change.folderId],
              changeType: change.changeType,
              secretVersionId: change.secretVersionId,
              folderVersionId: change.folderVersionId,
              isUpdate: false
            }))
        );

        logger.info(`Finished inserting folder commit changes - batch ${j} of ${commitBatches.length}`);

        // Create folder checkpoint resources
        // eslint-disable-next-line no-await-in-loop
        await knex.batchInsert(
          TableName.FolderCheckpointResources,
          foldersCommitsList
            .map((folderCommit) => folderCommit.changes)
            .flat()
            .map((change) => ({
              folderCheckpointId: newCheckpointsMap[change.folderId],
              folderVersionId: change.folderVersionId,
              secretVersionId: change.secretVersionId
            }))
        );

        logger.info(`Finished inserting folder checkpoint resources - batch ${j} of ${commitBatches.length}`);

        // Create Folder Tree Checkpoint
        // eslint-disable-next-line no-await-in-loop
        const newTreeCheckpoints = (await knex
          .batchInsert(
            TableName.FolderTreeCheckpoint,
            Object.keys(rootFoldersMap).map((folderId) => ({
              folderCommitId: newCommitsMap[folderId]
            }))
          )
          .returning("*")) as TFolderTreeCheckpoints[];

        logger.info(`Finished inserting folder tree checkpoints - batch ${j} of ${commitBatches.length}`);

        const newTreeCheckpointsMap: Record<string, string> = {};
        newTreeCheckpoints.forEach((checkpoint) => {
          newTreeCheckpointsMap[rootFoldersMap[newCommitsMapInverted[checkpoint.folderCommitId]]] = checkpoint.id;
        });

        // Create Folder Tree Checkpoint Resources
        // eslint-disable-next-line no-await-in-loop
        await knex
          .batchInsert(
            TableName.FolderTreeCheckpointResources,
            newCommitsInserted.map((folderCommit) => ({
              folderTreeCheckpointId: newTreeCheckpointsMap[folderCommit.envId],
              folderId: folderCommit.folderId,
              folderCommitId: folderCommit.id
            }))
          )
          .returning("*");

        logger.info(`Finished inserting folder tree checkpoint resources - batch ${j} of ${commitBatches.length}`);
      }
    }
  }
  logger.info("Folder commits initialized");
}

export async function down(knex: Knex): Promise<void> {
  const hasFolderCommitTable = await knex.schema.hasTable(TableName.FolderCommit);
  if (hasFolderCommitTable) {
    // delete all existing entries
    await knex(TableName.FolderCommit).del();
  }
}
