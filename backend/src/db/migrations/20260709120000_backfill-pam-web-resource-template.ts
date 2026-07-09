import { Knex } from "knex";

import { ProjectType, TableName } from "@app/db/schemas";
import {
  buildWebResourceTemplateBackfillRows,
  WEB_RESOURCE_DEFAULT_TEMPLATE
} from "@app/ee/services/pam-project/pam-project-template-backfill";

const TEMPLATE_INSERT_CHUNK = 500;

export async function up(knex: Knex): Promise<void> {
  const projects = await knex(TableName.Project).where("type", ProjectType.PAM).select("id");
  const rows = buildWebResourceTemplateBackfillRows(projects.map(({ id }) => id));

  for (let i = 0; i < rows.length; i += TEMPLATE_INSERT_CHUNK) {
    // eslint-disable-next-line no-await-in-loop
    await knex(TableName.PamAccountTemplate)
      .insert(rows.slice(i, i + TEMPLATE_INSERT_CHUNK))
      .onConflict(["projectId", "name"])
      .ignore();
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex(TableName.PamAccountTemplate)
    .where({
      name: WEB_RESOURCE_DEFAULT_TEMPLATE.name,
      type: WEB_RESOURCE_DEFAULT_TEMPLATE.type
    })
    .whereNotExists(function deleteOnlyUnusedWebResourceTemplates() {
      void this.select(knex.raw("1"))
        .from(TableName.PamAccount)
        .whereRaw("?? = ??", [`${TableName.PamAccount}.templateId`, `${TableName.PamAccountTemplate}.id`]);
    })
    .delete();
}
