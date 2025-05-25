import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";

import { ProjectType, TableName } from "../schemas";
import { getMigrationEnvConfig } from "./utils/env-config";
import { getMigrationPITServices } from "./utils/services";

export async function up(knex: Knex): Promise<void> {
  const hasFolderCommitTable = await knex.schema.hasTable(TableName.FolderCommit);
  if (hasFolderCommitTable) {
    const keyStore = inMemoryKeyStore();
    const envConfig = getMigrationEnvConfig();
    const { folderCommitService } = await getMigrationPITServices({ db: knex, keyStore, envConfig });
    const projects = await knex(TableName.Project).where({ version: 3, type: ProjectType.SecretManager }).select("id");
    for (const project of projects) {
      // eslint-disable-next-line no-await-in-loop
      await folderCommitService.initializeProject(project.id, knex);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasFolderCommitTable = await knex.schema.hasTable(TableName.FolderCommit);
  if (hasFolderCommitTable) {
    // delete all existing entries
    await knex(TableName.FolderCommit).del();
  }
}
