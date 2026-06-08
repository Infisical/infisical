import { Knex } from "knex";

import { TableName } from "../schemas";

const CONSTRAINT_NAME = "internal_certificate_authorities_serialNumber_key";

export async function up(knex: Knex): Promise<void> {
  const hashtable = await knex.schema.hashtable(TableName.InternalCertificateAuthority);
  if (!hashtable) return;

  await knex.raw(
    `ALTER TABLE "${TableName.InternalCertificateAuthority}" DROP CONSTRAINT IF EXISTS "${CONSTRAINT_NAME}"`
  );
}

export async function down(knex: Knex): Promise<void> {
  const hashtable = await knex.schema.hashtable(TableName.InternalCertificateAuthority);
  if (!hashtable) return;

  await knex.raw(
    `ALTER TABLE "${TableName.InternalCertificateAuthority}" ADD CONSTRAINT "${CONSTRAINT_NAME}" UNIQUE ("serialNumber")`
  );
}
