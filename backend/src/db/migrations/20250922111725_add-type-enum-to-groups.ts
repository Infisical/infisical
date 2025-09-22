import { Knex } from "knex";

import { TableName } from "../schemas";

const GROUPS_TYPE_CONSTRAINT = "groups_type_check";
const GROUPS_TYPE_DEFAULT = "USERS";
const GROUPS_TYPE_ALLOWED = ["USERS", "IDENTITIES"]; // Database-level enforcement via CHECK

export async function up(knex: Knex): Promise<void> {
  const hasTypeCol = await knex.schema.hasColumn(TableName.Groups, "type");

  if (!hasTypeCol) {
    // 1) Add the column as nullable first to avoid issues with existing rows
    await knex.schema.alterTable(TableName.Groups, (t) => {
      t.string("type");
    });

    // 2) Backfill existing rows
    await knex.raw(`UPDATE "${TableName.Groups}" SET "type" = ?`, [GROUPS_TYPE_DEFAULT]);

    // 3) Set NOT NULL and DEFAULT
    await knex.schema.alterTable(TableName.Groups, (t) => {
      t.string("type").notNullable().defaultTo(GROUPS_TYPE_DEFAULT).alter();
    });
  } else {
    // Ensure no NULLs remain and default is set if the column already exists
    await knex.raw(`UPDATE "${TableName.Groups}" SET "type" = ? WHERE "type" IS NULL`, [GROUPS_TYPE_DEFAULT]);
    await knex.raw(`ALTER TABLE "${TableName.Groups}" ALTER COLUMN "type" SET DEFAULT '${GROUPS_TYPE_DEFAULT}'`);
    await knex.raw(`ALTER TABLE "${TableName.Groups}" ALTER COLUMN "type" SET NOT NULL`);
  }

  // 4) Add CHECK constraint to emulate an enum at the DB level (idempotent)
  const { rows } = await knex.raw<{
    rows: Array<{ exists: boolean }>;
  }>(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_constraint c
       JOIN pg_class t ON c.conrelid = t.oid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE c.conname = ? AND t.relname = ?
     ) AS exists`,
    [GROUPS_TYPE_CONSTRAINT, TableName.Groups]
  );

  const constraintExists = rows?.[0]?.exists === true;
  if (!constraintExists) {
    await knex.raw(
      `ALTER TABLE "${TableName.Groups}" ADD CONSTRAINT ${GROUPS_TYPE_CONSTRAINT} CHECK ("type" IN (${GROUPS_TYPE_ALLOWED.map((v) => `'${v}'`).join(", ")}))`
    );
  }
}

export async function down(knex: Knex): Promise<void> {
  // Drop CHECK constraint if it exists
  await knex.raw(
    `DO $$
     BEGIN
       IF EXISTS (
         SELECT 1 FROM pg_constraint c
         JOIN pg_class t ON c.conrelid = t.oid
         WHERE c.conname = '${GROUPS_TYPE_CONSTRAINT}' AND t.relname = '${TableName.Groups}'
       ) THEN
         ALTER TABLE "${TableName.Groups}" DROP CONSTRAINT ${GROUPS_TYPE_CONSTRAINT};
       END IF;
     END $$;`
  );

  // Drop the column if it exists
  const hasTypeCol = await knex.schema.hasColumn(TableName.Groups, "type");
  if (hasTypeCol) {
    await knex.schema.alterTable(TableName.Groups, (t) => {
      t.dropColumn("type");
    });
  }
}
