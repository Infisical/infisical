/* eslint-disable no-await-in-loop -- batches commit one after another on purpose */
import { Knex } from "knex";

import { PamAccountType } from "@app/ee/services/pam/pam-enums";
import { DEFAULT_ACCOUNT_TEMPLATES } from "@app/ee/services/pam-project/pam-project-bootstrap";

import { ProjectType, TableName } from "../schemas";

const PROJECT_BATCH_SIZE = 500;
const BATCH_STATEMENT_TIMEOUT_MS = 60_000;

// Bootstrap only seeds new PAM projects, so existing ones get the MariaDB template here.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PamAccountTemplate))) return;

  const template = DEFAULT_ACCOUNT_TEMPLATES.find(({ type }) => type === PamAccountType.MariaDB);
  if (!template) return;

  // Keyset paging keeps each batch bounded, and each batch commits in its own short transaction.
  let lastProjectId: string | undefined;
  for (;;) {
    const done = await knex.transaction(async (tx) => {
      await tx.raw(`SET LOCAL statement_timeout = ${BATCH_STATEMENT_TIMEOUT_MS}`);

      const projectIds = (await tx(TableName.Project)
        .where({ type: ProjectType.PAM })
        .modify((qb) => {
          if (lastProjectId) void qb.where("id", ">", lastProjectId);
        })
        .orderBy("id")
        .limit(PROJECT_BATCH_SIZE)
        .pluck("id")) as string[];
      if (!projectIds.length) return true;
      lastProjectId = projectIds[projectIds.length - 1];

      const missingProjectIds = (await tx(TableName.Project)
        .whereIn("id", projectIds)
        .whereNotExists(
          tx(TableName.PamAccountTemplate)
            .select("id")
            .whereRaw(`"projectId" = ${TableName.Project}.id`)
            .where({ type: PamAccountType.MariaDB })
        )
        .pluck("id")) as string[];
      if (!missingProjectIds.length) return false;

      const takenNames = await tx(TableName.PamAccountTemplate)
        .whereIn("projectId", missingProjectIds)
        .where("name", "like", `${template.name}%`)
        .select("projectId", "name");
      const takenByProject = new Map<string, Set<string>>();
      takenNames.forEach(({ projectId, name }) => {
        if (!takenByProject.has(projectId)) takenByProject.set(projectId, new Set());
        takenByProject.get(projectId)?.add(name);
      });

      // A project may already use the default name for another type, so take the next free suffix.
      const rows = missingProjectIds.map((projectId) => {
        const taken = takenByProject.get(projectId);
        let { name } = template;
        for (let n = 1; taken?.has(name); n += 1) name = `${template.name}-${n}`;
        return { projectId, name, type: template.type, settings: template.settings };
      });

      await tx(TableName.PamAccountTemplate).insert(rows).onConflict(["projectId", "name"]).ignore();
      return false;
    });
    if (done) break;
  }
}

// Templates may already have accounts attached, so there is nothing safe to remove.
export async function down(): Promise<void> {}

const config = { transaction: false };
export { config };
