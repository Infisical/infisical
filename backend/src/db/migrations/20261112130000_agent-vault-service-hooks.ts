import { Knex } from "knex";

import { TableName } from "../schemas";

const SERVICE = TableName.AgentVaultService;
const HOOK_SECRET_CHECK = "agent_vault_services_hook_secret_check";
const HOOK_URL_CHECK = "agent_vault_services_hook_url_check";

// Text rather than a varchar: the API holds the 2048 limit.
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(SERVICE, "hookUrl")) return;
  await knex.schema.alterTable(SERVICE, (t) => {
    t.text("hookUrl").nullable();
    t.binary("encryptedHookSecret").nullable();
  });
  await knex.raw(`ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("encryptedHookSecret" IS NULL OR "hookUrl" IS NOT NULL)`, [
    SERVICE,
    HOOK_SECRET_CHECK
  ]);
  // An inline service's secret goes when its session ends and its URL stays for history. A project's service always
  // has secretsDeletedAt NULL (agent_vault_services_inline_position_check), so its hook always has its secret.
  await knex.raw(
    `ALTER TABLE ?? ADD CONSTRAINT ?? CHECK ("hookUrl" IS NULL OR "encryptedHookSecret" IS NOT NULL OR "secretsDeletedAt" IS NOT NULL)`,
    [SERVICE, HOOK_URL_CHECK]
  );
}

export async function down(knex: Knex): Promise<void> {
  for (const constraint of [HOOK_SECRET_CHECK, HOOK_URL_CHECK]) {
    // eslint-disable-next-line no-await-in-loop
    await knex.raw(`ALTER TABLE ?? DROP CONSTRAINT IF EXISTS ??`, [SERVICE, constraint]);
  }
  if (await knex.schema.hasColumn(SERVICE, "hookUrl")) {
    await knex.schema.alterTable(SERVICE, (t) => {
      t.dropColumn("hookUrl");
      t.dropColumn("encryptedHookSecret");
    });
  }
}
