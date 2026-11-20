import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const HOOK = TableName.AgentVaultHook;
const HOOK_SERVICE = TableName.AgentVaultHookService;
const SESSION = TableName.AgentVaultSession;

const PROJECT_NAME_UNIQUE = "agent_vault_hooks_project_name_unique";
const SAVED_CHECK = "agent_vault_hooks_saved_check";
const INLINE_CHECK = "agent_vault_hooks_inline_check";
const SECRET_CHECK = "agent_vault_hooks_secret_check";

// Hooks used to be columns on agent_vault_services (hookUrl, encryptedHookSecret). Those stay in this release because
// pods on the previous release still read them during a rolling deploy; the next release's migration drops them.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(HOOK))) {
    await knex.schema.createTable(HOOK, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId", 36).notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      // Set only on a hook sent inline with a session, which belongs to that session alone.
      t.uuid("sessionId").nullable();
      t.foreign("sessionId").references("id").inTable(SESSION).onDelete("CASCADE");
      t.index("sessionId");

      t.string("name", 64).nullable();
      t.text("description").nullable();
      // Text rather than a varchar: the API holds the 2048 limit.
      t.text("url").notNullable();
      t.binary("encryptedSecret").nullable();
      // A hook with no services checks every request only when it was saved that way. One left without services
      // because they were deleted checks nothing, rather than suddenly checking everything.
      t.boolean("appliesToAllServices").notNullable();
      t.timestamp("secretsDeletedAt", { useTz: true }).nullable();

      t.timestamps(true, true, true);
    });
    await createOnUpdateTrigger(knex, HOOK);

    await knex.raw(`CREATE UNIQUE INDEX ?? ON ?? ("projectId", lower("name")) WHERE "sessionId" IS NULL`, [
      PROJECT_NAME_UNIQUE,
      HOOK
    ]);
    await knex.raw(
      `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("sessionId" IS NOT NULL OR ("name" IS NOT NULL AND "encryptedSecret" IS NOT NULL AND "secretsDeletedAt" IS NULL))`,
      [HOOK, SAVED_CHECK]
    );
    await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("sessionId" IS NULL OR "name" IS NULL)`, [
      HOOK,
      INLINE_CHECK
    ]);
    // An inline hook's secret goes when its session ends and the rest stays for history, so a hook without a secret
    // is always one whose secrets were deleted: the proxy never gets a hook it can't sign for.
    await knex.raw(
      `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("encryptedSecret" IS NOT NULL OR "secretsDeletedAt" IS NOT NULL)`,
      [HOOK, SECRET_CHECK]
    );
  }

  // A hook's rules: the project services it checks, each optionally narrowed. Deleting a service removes it from
  // every hook.
  if (!(await knex.schema.hasTable(HOOK_SERVICE))) {
    await knex.schema.createTable(HOOK_SERVICE, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("hookId").notNullable();
      t.foreign("hookId").references("id").inTable(HOOK).onDelete("CASCADE");

      t.uuid("serviceId").notNullable();
      t.foreign("serviceId").references("id").inTable(TableName.AgentVaultService).onDelete("CASCADE");
      t.index("serviceId");

      t.integer("position").notNullable();
      t.jsonb("methods").nullable();
      t.jsonb("paths").nullable();
      t.jsonb("tools").nullable();

      t.timestamps(true, true, true);
      t.unique(["hookId", "serviceId"]);
    });
    await createOnUpdateTrigger(knex, HOOK_SERVICE);
  }

  if (!(await knex.schema.hasColumn(SESSION, "hookId"))) {
    await knex.schema.alterTable(SESSION, (t) => {
      t.uuid("hookId").nullable();
      t.foreign("hookId").references("id").inTable(HOOK).onDelete("SET NULL");
      t.index("hookId");
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(SESSION, "hookId")) {
    await knex.schema.alterTable(SESSION, (t) => {
      t.dropForeign(["hookId"]);
      t.dropIndex(["hookId"]);
      t.dropColumn("hookId");
    });
  }
  await knex.schema.dropTableIfExists(HOOK_SERVICE);
  await dropOnUpdateTrigger(knex, HOOK_SERVICE);
  await knex.schema.dropTableIfExists(HOOK);
  await dropOnUpdateTrigger(knex, HOOK);
}
