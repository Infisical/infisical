import { Knex } from "knex";

import { PamAccountType } from "@app/ee/services/pam/pam-enums";
import { DEFAULT_ACCOUNT_TEMPLATES } from "@app/ee/services/pam-project/pam-project-bootstrap";

import { ProjectType, TableName } from "../schemas";

const TEMPLATE_INSERT_CHUNK = 1000;

// Bootstrap only seeds new PAM projects, so existing ones get the MariaDB template here.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.PamAccountTemplate))) return;

  const template = DEFAULT_ACCOUNT_TEMPLATES.find(({ type }) => type === PamAccountType.MariaDB);
  if (!template) return;

  const projects = await knex(TableName.Project)
    .where({ type: ProjectType.PAM })
    .whereNotExists(
      knex(TableName.PamAccountTemplate)
        .select("id")
        .whereRaw(`"projectId" = ${TableName.Project}.id`)
        .where({ type: PamAccountType.MariaDB })
    )
    .select("id");

  const rows = projects.map(({ id }) => ({
    projectId: id,
    name: template.name,
    type: template.type,
    settings: template.settings
  }));

  for (let i = 0; i < rows.length; i += TEMPLATE_INSERT_CHUNK) {
    // eslint-disable-next-line no-await-in-loop
    await knex(TableName.PamAccountTemplate)
      .insert(rows.slice(i, i + TEMPLATE_INSERT_CHUNK))
      .onConflict(["projectId", "name"])
      .ignore();
  }
}

// Templates may already have accounts attached, so there is nothing safe to remove.
export async function down(): Promise<void> {}
