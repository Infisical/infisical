import { Knex } from "knex";

import { TableName } from "../schemas";

const DEFAULT_INTERVAL_SECONDS = 86_400;
const JITTER_CAP_SECONDS = 1_800;

// Credential health checking is on by default, so templates created before the feature existed are opted in
// here rather than left silently unmonitored. Accounts are scheduled a full interval out with the same jitter
// the scheduler uses, so upgrading never produces a burst of logins against a customer's targets.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasColumn(TableName.PamAccount, "nextHeartbeatAt"))) return;

  await knex(TableName.PamAccountTemplate)
    .whereRaw(`COALESCE(settings, '{}'::jsonb) -> 'heartbeat' IS NULL`)
    .update({
      settings: knex.raw(`COALESCE(settings, '{}'::jsonb) || ?::jsonb`, [
        JSON.stringify({ heartbeat: { enabled: true, intervalSeconds: DEFAULT_INTERVAL_SECONDS } })
      ])
    });

  // Derived from the templates' current state rather than from the rows above, so an account left unscheduled
  // by an earlier partial run is picked up too. A rejected credential keeps its stopped state.
  await knex(TableName.PamAccount)
    .whereNull("nextHeartbeatAt")
    .whereRaw(`("heartbeatStatus" is null or "heartbeatStatus" <> ?)`, ["invalid-credentials"])
    .whereIn(
      "templateId",
      knex(TableName.PamAccountTemplate)
        .select("id")
        .whereRaw(`settings -> 'heartbeat' ->> 'enabled' = 'true'`)
        .whereRaw(`(settings -> 'heartbeat' ->> 'intervalSeconds') IS NOT NULL`)
    )
    .update({
      nextHeartbeatAt: knex.raw(
        `GREATEST(COALESCE(??, now()) + make_interval(secs => (
           SELECT (t.settings -> 'heartbeat' ->> 'intervalSeconds')::int
           FROM ?? t WHERE t.id = ??
         )), now()) + make_interval(secs => floor(random() * ?)::int)`,
        ["lastHeartbeatAt", TableName.PamAccountTemplate, `${TableName.PamAccount}.templateId`, JITTER_CAP_SECONDS]
      ) as unknown as Date
    });
}

// A template this enabled is indistinguishable from one an administrator turned on afterwards, so there is
// nothing safe to withdraw.
export async function down(): Promise<void> {}
