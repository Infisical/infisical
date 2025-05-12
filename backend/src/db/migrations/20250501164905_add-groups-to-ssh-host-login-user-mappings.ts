import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.SshHostLoginUserMapping, "groupId"))) {
    await knex.schema.alterTable(TableName.SshHostLoginUserMapping, (t) => {
      t.uuid("groupId").nullable();
      t.foreign("groupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");
      t.unique(["sshHostLoginUserId", "groupId"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.SshHostLoginUserMapping, "groupId")) {
    await knex.schema.alterTable(TableName.SshHostLoginUserMapping, (t) => {
      t.dropUnique(["sshHostLoginUserId", "groupId"]);
      t.dropColumn("groupId");
    });
  }
}
