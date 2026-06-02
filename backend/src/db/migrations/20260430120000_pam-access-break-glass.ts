import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.ApprovalPolicies)) {
    const hasEnforcementLevel = await knex.schema.hasColumn(TableName.ApprovalPolicies, "enforcementLevel");
    if (!hasEnforcementLevel) {
      await knex.schema.alterTable(TableName.ApprovalPolicies, (t) => {
        t.string("enforcementLevel").notNullable().defaultTo("hard");
      });
    }
  }

  if (!(await knex.schema.hasTable(TableName.ApprovalPolicyBypassers))) {
    await knex.schema.createTable(TableName.ApprovalPolicyBypassers, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("policyId").notNullable().index();
      t.foreign("policyId").references("id").inTable(TableName.ApprovalPolicies).onDelete("CASCADE");

      t.uuid("userId").nullable().index();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.uuid("groupId").nullable().index();
      t.foreign("groupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");

      t.check('("userId" IS NOT NULL AND "groupId" IS NULL) OR ("userId" IS NULL AND "groupId" IS NOT NULL)');

      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, TableName.ApprovalPolicyBypassers);
  }

  if (await knex.schema.hasTable(TableName.ApprovalRequestGrants)) {
    const hasIsBreakGlass = await knex.schema.hasColumn(TableName.ApprovalRequestGrants, "isBreakGlass");
    const hasBypassReason = await knex.schema.hasColumn(TableName.ApprovalRequestGrants, "bypassReason");
    if (!hasIsBreakGlass || !hasBypassReason) {
      await knex.schema.alterTable(TableName.ApprovalRequestGrants, (t) => {
        if (!hasIsBreakGlass) t.boolean("isBreakGlass").notNullable().defaultTo(false);
        if (!hasBypassReason) t.text("bypassReason").nullable();
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.ApprovalRequestGrants)) {
    const hasIsBreakGlass = await knex.schema.hasColumn(TableName.ApprovalRequestGrants, "isBreakGlass");
    const hasBypassReason = await knex.schema.hasColumn(TableName.ApprovalRequestGrants, "bypassReason");
    if (hasIsBreakGlass || hasBypassReason) {
      await knex.schema.alterTable(TableName.ApprovalRequestGrants, (t) => {
        if (hasIsBreakGlass) t.dropColumn("isBreakGlass");
        if (hasBypassReason) t.dropColumn("bypassReason");
      });
    }
  }

  await dropOnUpdateTrigger(knex, TableName.ApprovalPolicyBypassers);
  await knex.schema.dropTableIfExists(TableName.ApprovalPolicyBypassers);

  if (await knex.schema.hasTable(TableName.ApprovalPolicies)) {
    const hasEnforcementLevel = await knex.schema.hasColumn(TableName.ApprovalPolicies, "enforcementLevel");
    if (hasEnforcementLevel) {
      await knex.schema.alterTable(TableName.ApprovalPolicies, (t) => {
        t.dropColumn("enforcementLevel");
      });
    }
  }
}
