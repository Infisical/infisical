import { Knex } from "knex";

import { inMemoryKeyStore } from "@app/keystore/memory";

import { ProjectType, TableName } from "../schemas";
import { getMigrationPITServices } from "./utils/services";

export async function up(knex: Knex): Promise<void> {
  const hasFolderCommitTable = await knex.schema.hasTable(TableName.FolderCommit);
  if (hasFolderCommitTable) {
    const keyStore = inMemoryKeyStore();
    const { folderCommitService } = await getMigrationPITServices({ db: knex, keyStore });
    const projects = await knex(TableName.Project).where({ version: 3, type: ProjectType.SecretManager }).select("id");
    await knex.transaction(async (tx) => {
      for (const project of projects) {
        // eslint-disable-next-line no-await-in-loop
        await folderCommitService.initializeProject(project.id, tx);
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasFolderCommitTable = await knex.schema.hasTable(TableName.FolderCommit);
  if (hasFolderCommitTable) {
    // delete all existing entries
    await knex(TableName.FolderCommit).del();
  }
}
