import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

const sessions = "pam_web_app_sessions";
const tickets = "pam_web_app_attach_tickets";
const storage = "pam_session_recording_storage";
const manifests = "pam_session_recording_manifests";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(sessions, (t) => {
    t.uuid("sessionId").primary().references("id").inTable(TableName.PamSession).onDelete("CASCADE");
    t.uuid("createdByUserId").nullable().references("id").inTable(TableName.Users).onDelete("SET NULL").index();
    t.uuid("accountId").nullable().index();
    t.text("idempotencyKey");
    t.binary("idempotencyPayloadHash");
    t.integer("allocationGen").notNullable().defaultTo(0);
    t.integer("controllerGen").notNullable().defaultTo(0);
    t.uuid("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("SET NULL").index();
    t.text("workerState").notNullable().defaultTo("allocating");
    t.text("workerStateReason");
    t.integer("workerReportSeq").notNullable().defaultTo(0);
    for (const field of ["lastWorkerContactAt", "leaseUntil", "reconnectDeadlineAt", "stopConfirmedAt"]) {
      t.timestamp(field, { useTz: true });
    }
    t.jsonb("policySnapshot").notNullable();
    t.integer("chunksEmitted").notNullable().defaultTo(0);
    t.jsonb("recordingFinalReport");
    t.timestamps(true, true, true);
    t.check(
      "\"workerState\" IN ('allocating', 'provisioning', 'provisioned', 'recording-ready', 'active', 'detached', 'ending', 'stop-unconfirmed', 'stopped', 'failed')"
    );
  });
  await knex.raw(
    `CREATE UNIQUE INDEX pam_web_app_sessions_launch_key ON ?? ("createdByUserId", "accountId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL AND "workerState" NOT IN ('stopped', 'failed')`,
    [sessions]
  );
  await createOnUpdateTrigger(knex, sessions);

  await knex.schema.createTable(tickets, (t) => {
    t.uuid("id").primary().defaultTo(knex.fn.uuid());
    t.uuid("sessionId").notNullable().references("id").inTable(TableName.PamSession).onDelete("CASCADE").index();
    t.uuid("userId").notNullable();
    t.binary("tokenHash").notNullable().unique();
    t.integer("controllerGen").notNullable();
    t.boolean("takeControl").notNullable();
    t.uuid("tokenVersionId");
    t.integer("accessVersion");
    t.timestamp("expiresAt", { useTz: true }).notNullable();
    t.timestamp("consumedAt", { useTz: true });
    t.timestamp("createdAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.createTable(storage, (t) => {
    t.uuid("sessionId").primary().references("id").inTable(TableName.PamSession).onDelete("CASCADE");
    t.text("backend").notNullable();
    t.uuid("connectionId").index();
    t.text("connectionName");
    t.text("bucket");
    t.text("region");
    t.text("keyPrefix");
    t.timestamp("snapshotAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.alterTable(TableName.PamSessionEventChunk, (t) => {
    t.text("externalObjectVersionId");
    t.timestamp("verifiedAt", { useTz: true });
    t.binary("verifiedSha256");
  });
  await knex.schema.createTable(manifests, (t) => {
    t.uuid("sessionId").primary().references("id").inTable(TableName.PamSession).onDelete("CASCADE");
    t.integer("version").notNullable();
    t.jsonb("canonical").notNullable();
    t.binary("canonicalSha256").notNullable();
    t.binary("signature");
    t.uuid("signingKeyId");
    t.text("alg");
    t.timestamp("signaturePendingUntil", { useTz: true });
    t.text("status").notNullable();
    t.text("statusDetail");
    t.timestamp("finalizedAt", { useTz: true }).notNullable();
    t.check("\"status\" IN ('complete', 'incomplete', 'mismatch')");
  });
  // The TypeScript alternative is to update the web row atomically in pam-session-access-fns.ts and the expiration job.
  await knex.raw(`CREATE FUNCTION pam_web_app_end_with_session() RETURNS trigger AS $$
    BEGIN
      IF NEW."accountType" = 'web-app' AND NEW.status IN ('ended', 'terminated') THEN
        UPDATE pam_web_app_sessions SET
          "workerState" = CASE WHEN "allocationGen" = 0 THEN 'stopped' ELSE 'ending' END,
          "stopConfirmedAt" = CASE WHEN "allocationGen" = 0 THEN now() ELSE "stopConfirmedAt" END,
          "workerStateReason" = CASE WHEN "allocationGen" = 0 THEN 'never-allocated' ELSE "workerStateReason" END
        WHERE "sessionId" = NEW.id AND "workerState" NOT IN ('stopped', 'failed', 'stop-unconfirmed');
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql`);
  await knex.raw(`CREATE TRIGGER pam_web_app_end_with_session AFTER UPDATE OF status ON pam_sessions
    FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION pam_web_app_end_with_session()`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TRIGGER pam_web_app_end_with_session ON pam_sessions");
  await knex.raw("DROP FUNCTION pam_web_app_end_with_session()");
  await Promise.all([manifests, storage, tickets].map((table) => knex.schema.dropTable(table)));
  await knex.schema.alterTable(TableName.PamSessionEventChunk, (t) => {
    t.dropColumns("externalObjectVersionId", "verifiedAt", "verifiedSha256");
  });
  await dropOnUpdateTrigger(knex, sessions);
  await knex.schema.dropTable(sessions);
}
