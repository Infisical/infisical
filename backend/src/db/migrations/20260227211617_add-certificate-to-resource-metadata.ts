import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.ResourceMetadata, "certificateId"))) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (tb) => {
      tb.uuid("certificateId");
      tb.foreign("certificateId").references("id").inTable(TableName.Certificate).onDelete("CASCADE");
    });
  }

  if (!(await knex.schema.hasColumn(TableName.ResourceMetadata, "certificateRequestId"))) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (tb) => {
      tb.uuid("certificateRequestId");
      tb.datetime("certificateRequestCreatedAt");
      tb.foreign(["certificateRequestId", "certificateRequestCreatedAt"])
        .references(["id", "createdAt"])
        .inTable(TableName.CertificateRequests)
        .onDelete("CASCADE");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(TableName.ResourceMetadata, "certificateId")) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (tb) => {
      tb.dropColumn("certificateId");
    });
  }

  if (await knex.schema.hasColumn(TableName.ResourceMetadata, "certificateRequestId")) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (tb) => {
      tb.dropColumn("certificateRequestCreatedAt");
      tb.dropColumn("certificateRequestId");
    });
  }
}
