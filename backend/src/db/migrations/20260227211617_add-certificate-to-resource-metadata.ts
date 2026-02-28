import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.ResourceMetadata, "certificateId"))) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (tb) => {
      tb.uuid("certificateId");
      tb.foreign("certificateId").references("id").inTable(TableName.Certificate).onDelete("CASCADE");
      tb.index("certificateId");
    });
  }

  if (!(await knex.schema.hasColumn(TableName.ResourceMetadata, "certificateRequestId"))) {
    await knex.schema.alterTable(TableName.ResourceMetadata, (tb) => {
      tb.uuid("certificateRequestId");
      tb.datetime("certificateRequestCreatedAt", { precision: 3 });
      tb.foreign(["certificateRequestId", "certificateRequestCreatedAt"])
        .references(["id", "createdAt"])
        .inTable(TableName.CertificateRequests)
        .onDelete("CASCADE");
      tb.index("certificateRequestId");
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
