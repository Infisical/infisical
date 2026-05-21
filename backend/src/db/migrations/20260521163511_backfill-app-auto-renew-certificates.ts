import { Knex } from "knex";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `UPDATE ?? SET "renewBeforeDays" = sub."renewBeforeDays"
     FROM (
       SELECT c.id AS cert_id, aec."renewBeforeDays"
       FROM ?? c
       JOIN ?? ap ON ap."applicationId" = c."applicationId" AND ap."profileId" = c."profileId"
       JOIN ?? aec ON aec.id = ap."apiConfigId"
       WHERE c."renewBeforeDays" IS NULL
         AND c."applicationId" IS NOT NULL
         AND c."profileId" IS NOT NULL
         AND aec."autoRenew" = true
         AND aec."renewBeforeDays" IS NOT NULL
     ) sub
     WHERE ??.id = sub.cert_id`,
    [
      TableName.Certificate,
      TableName.Certificate,
      TableName.PkiApplicationProfile,
      TableName.PkiApiEnrollmentConfig,
      TableName.Certificate
    ]
  );
}

export async function down(): Promise<void> {
  // Cannot reliably reverse: we can't distinguish certificates that were
  // backfilled from ones that legitimately had renewBeforeDays set.
}
