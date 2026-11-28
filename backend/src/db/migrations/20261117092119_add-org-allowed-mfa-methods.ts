import { Knex } from "knex";

import { TableName } from "../schemas";

// Expand step of the move from one enforced method (selectedMfaMethod) to an allowlist.
// 20261120120000_drop-org-selected-mfa-method drops selectedMfaMethod.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.Organization, "allowedMfaMethods"))) {
    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.specificType("allowedMfaMethods", "text[]").nullable();
    });
  }

  await knex(TableName.Organization)
    .whereNull("allowedMfaMethods")
    .whereNotNull("selectedMfaMethod")
    // @ts-expect-error knex types reject a raw value for a typed column; the SQL builds the array from the old column
    .update({ allowedMfaMethods: knex.raw("ARRAY[??]", ["selectedMfaMethod"]) });
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.Organization, "allowedMfaMethods")) {
    await knex(TableName.Organization)
      .whereRaw(`cardinality(??) > 0`, ["allowedMfaMethods"])
      // @ts-expect-error knex types reject a raw value for a typed column; the SQL copies the first allowed method back
      .update({ selectedMfaMethod: knex.raw(`??[1]`, ["allowedMfaMethods"]) });

    await knex.schema.alterTable(TableName.Organization, (t) => {
      t.dropColumn("allowedMfaMethods");
    });
  }
}
