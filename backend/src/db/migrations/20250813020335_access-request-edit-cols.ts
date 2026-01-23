import { Knex } from "knex";

import { TableName } from "@app/db/schemas/models";

export async function up(knex: Knex): Promise<void> {
  const hasEditNoteCol = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "editNote");
  const hasEditedByUserId = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "editedByUserId");

  if (!hasEditNoteCol || !hasEditedByUserId) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      if (!hasEditedByUserId) {
        t.uuid("editedByUserId").nullable();
        t.foreign("editedByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      }

      if (!hasEditNoteCol) {
        t.string("editNote").nullable();
      }
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasEditNoteCol = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "editNote");
  const hasEditedByUserId = await knex.schema.hasColumn(TableName.AccessApprovalRequest, "editedByUserId");

  if (hasEditNoteCol || hasEditedByUserId) {
    await knex.schema.alterTable(TableName.AccessApprovalRequest, (t) => {
      if (hasEditedByUserId) {
        t.dropColumn("editedByUserId");
      }

      if (hasEditNoteCol) {
        t.dropColumn("editNote");
      }
    });
  }
}
