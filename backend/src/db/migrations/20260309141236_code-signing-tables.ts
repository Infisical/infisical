import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.Signers))) {
    await knex.schema.createTable(TableName.Signers, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable().index();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("name", 64).notNullable();
      t.string("description", 256).nullable();
      t.string("status").notNullable().defaultTo("active");
      t.uuid("certificateId").notNullable();
      t.foreign("certificateId").references("id").inTable(TableName.Certificate).onDelete("RESTRICT");
      t.uuid("approvalPolicyId").notNullable();
      t.foreign("approvalPolicyId").references("id").inTable(TableName.ApprovalPolicies).onDelete("RESTRICT");
      t.datetime("lastSignedAt").nullable();
      t.timestamps(true, true, true);
      t.unique(["projectId", "name"]);
      t.index("certificateId");
      t.index("approvalPolicyId");
    });

    await createOnUpdateTrigger(knex, TableName.Signers);
  }

  if (!(await knex.schema.hasTable(TableName.SigningOperations))) {
    await knex.schema.createTable(TableName.SigningOperations, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("signerId").notNullable();
      t.foreign("signerId").references("id").inTable(TableName.Signers).onDelete("CASCADE");
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.string("status").notNullable();
      t.string("signingAlgorithm").notNullable();
      t.string("dataHash", 128).notNullable();
      t.string("actorType").notNullable();
      t.uuid("actorId").notNullable();
      t.string("actorName").nullable();
      t.uuid("approvalGrantId").nullable();
      t.foreign("approvalGrantId").references("id").inTable(TableName.ApprovalRequestGrants).onDelete("SET NULL");
      t.jsonb("clientMetadata").nullable();
      t.string("errorMessage").nullable();
      t.datetime("createdAt").defaultTo(knex.fn.now()).notNullable();
      t.index(["signerId", "createdAt"]);
      t.index(["projectId", "createdAt"]);
      t.index("approvalGrantId");
    });
  }

  // Add granteeMachineIdentityId to approval_request_grants so grants can target machine identities
  const hasCol = await knex.schema.hasColumn(TableName.ApprovalRequestGrants, "granteeMachineIdentityId");
  if (!hasCol) {
    await knex.schema.alterTable(TableName.ApprovalRequestGrants, (t) => {
      t.uuid("granteeMachineIdentityId").nullable().index();
      t.foreign("granteeMachineIdentityId").references("id").inTable(TableName.Identity).onDelete("SET NULL");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.SigningOperations);
  await dropOnUpdateTrigger(knex, TableName.Signers);
  await knex.schema.dropTableIfExists(TableName.Signers);

  const hasCol = await knex.schema.hasColumn(TableName.ApprovalRequestGrants, "granteeMachineIdentityId");
  if (hasCol) {
    await knex.schema.alterTable(TableName.ApprovalRequestGrants, (t) => {
      t.dropIndex("granteeMachineIdentityId");
      t.dropForeign(["granteeMachineIdentityId"]);
      t.dropColumn("granteeMachineIdentityId");
    });
  }
}
