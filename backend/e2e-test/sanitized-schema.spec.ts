import { readFile } from "node:fs/promises";
import path from "node:path";

import { Knex } from "knex";
import pino from "pino";
import { describe, expect, test } from "vitest";

import { createSanitizedSchema, dropSanitizedSchema } from "@app/db/sanitized-schema";

declare const testDb: Knex;

const logger = pino({ level: "silent" });

// Startup only rebuilds these views when GENERATE_SANITIZED_SCHEMA is set, and only logs the failure unless
// FAIL_ON_SANITIZED_SCHEMA_ERROR is set too, so a migration that drops a column listed in sanitized-schema.yaml
// goes unnoticed until a deployment with the flag restarts.
describe("Sanitized schema", () => {
  test("every view in sanitized-schema.yaml can be created against the migrated database", async () => {
    const yaml = await readFile(path.join(__dirname, "../src/db/sanitized-schema.yaml"), "utf8");
    const expectedViewCount = yaml.match(/^\s+source:/gm)?.length ?? 0;

    const tx = await testDb.transaction();
    try {
      await dropSanitizedSchema({ db: tx, logger });
      await createSanitizedSchema({ db: tx, logger });

      const [{ count }] = await tx("information_schema.views")
        .where({ table_schema: "analytics" })
        .count<{ count: string }[]>("* as count");

      expect(expectedViewCount).toBeGreaterThan(0);
      expect(Number(count)).toBe(expectedViewCount);
    } finally {
      await tx.rollback();
    }
  });
});
