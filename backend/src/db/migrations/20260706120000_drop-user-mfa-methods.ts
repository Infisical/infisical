import { Knex } from "knex";

import { TableName } from "../schemas";

// The users.mfaMethods text[] column is a leftover from the original MFA design. It was only
// ever written (to ["email"] / []) and never read anywhere; MFA logic keys off isMfaEnabled and
// selectedMfaMethod instead. Drop it.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Users, "mfaMethods")) {
    await knex.schema.alterTable(TableName.Users, (t) => {
      t.dropColumn("mfaMethods");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Users, "mfaMethods"))) {
    await knex.schema.alterTable(TableName.Users, (t) => {
      t.specificType("mfaMethods", "text[]");
    });
  }
}
