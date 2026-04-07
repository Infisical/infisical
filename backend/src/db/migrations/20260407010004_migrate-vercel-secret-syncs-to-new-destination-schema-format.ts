import { Knex } from "knex";

import { selectAllTableCols } from "@app/lib/knex";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { VercelSyncScope } from "@app/services/secret-sync/vercel";

import { TableName } from "../schemas";

export async function up(knex: Knex): Promise<void> {
  const vercelSecretSyncs = await knex(TableName.SecretSync)
    .where("destination", SecretSync.Vercel)
    .select(selectAllTableCols(TableName.SecretSync));

  if (vercelSecretSyncs?.length) {
    await Promise.all(
      vercelSecretSyncs.map(async (sync) => {
        if (typeof sync.destinationConfig === "object" && sync.destinationConfig !== null) {
          const destinationConfig = {
            ...sync.destinationConfig,
            scope: VercelSyncScope.Project
          };

          await knex(TableName.SecretSync).where("id", sync.id).update({
            destinationConfig
          });
        }
      })
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function down(knex: Knex): Promise<void> {
  // No down migration needed
}
