import { Knex } from "knex";

import { TableName } from "../schemas";

// One row per request a broker handled, so an Agent Gateway session can be replayed after the fact: what the
// agent called, and whether Infisical put a credential on it.
//
// Unlike pam_session_event_batches this is not encrypted, because it deliberately holds no payload: the
// request line as the agent sent it (so a substituted path shows the placeholder, never the value), the
// decision, the upstream status, and the *names* of the credentials applied. Bodies, header values and
// resolved secrets never reach it, which is what makes plaintext metadata the right trade for something a
// reviewer needs to read quickly.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AgentGatewaySessionRequest))) {
    await knex.schema.createTable(TableName.AgentGatewaySessionRequest, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("sessionId").notNullable();
      t.foreign("sessionId").references("id").inTable(TableName.AgentGatewaySession).onDelete("CASCADE");

      // The broker's own clock for the request, kept separate from createdAt: a batch arrives seconds later,
      // and ordering a replay by arrival time would scramble it.
      t.datetime("occurredAt").notNullable();

      t.string("method", 16).notNullable();
      t.string("host", 255).notNullable();
      t.integer("port");
      // Bounded rather than text: a path is display data here, and the broker truncates before sending.
      t.string("path", 2048);
      t.string("decision", 16).notNullable();
      t.integer("statusCode");

      // No FK to proxied_services: a service deleted later must not erase the record that it was used.
      t.uuid("serviceId");
      t.string("serviceName", 64);

      // [{ key | dynamicSecretName + dynamicSecretField, role, header?, surfaces? }]. Names only.
      t.jsonb("credentials");
      t.string("errorMessage", 500);

      t.timestamps(true, true, true);

      // The read pattern is "this session, in order", and the cascade needs the leftmost column anyway.
      t.index(["sessionId", "occurredAt"]);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AgentGatewaySessionRequest);
}
