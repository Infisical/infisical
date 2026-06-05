import { Knex } from "knex";

import { TableName } from "../schemas";

// Enrollment-based KMIP servers store their certificate config on the resource itself (set in the
// UI at creation) instead of having the daemon pass it on every launch. The /connect endpoint
// reads these; the legacy machine-identity /server-registration path still takes them in the body.
const COLUMNS = ["hostnamesOrIps", "ttl", "commonName", "keyAlgorithm"] as const;

export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.KmipServer)) {
    await knex.schema.alterTable(TableName.KmipServer, (t) => {
      COLUMNS.forEach((col) => t.string(col));
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.KmipServer)) {
    const cols: string[] = [];
    for (const col of COLUMNS) {
      // eslint-disable-next-line no-await-in-loop
      if (await knex.schema.hasColumn(TableName.KmipServer, col)) cols.push(col);
    }
    if (cols.length) {
      await knex.schema.alterTable(TableName.KmipServer, (t) => {
        t.dropColumns(...cols);
      });
    }
  }
}
