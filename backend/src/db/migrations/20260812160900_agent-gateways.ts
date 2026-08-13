import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

// Agent Gateways replace the folder-scoped proxied services shipped in 20260710162607. The old shape is
// dropped rather than migrated: it was enterprise-gated, ~4 weeks old, and its authorization anchor
// (folder RBAC plus a pair of hand-authored machine identities) is exactly what this change removes.
// Both tables are recreated under their original names because the product concept keeps its name.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.ProxiedServiceCredential);
  await dropOnUpdateTrigger(knex, TableName.ProxiedServiceCredential);
  await knex.schema.dropTableIfExists(TableName.ProxiedService);
  await dropOnUpdateTrigger(knex, TableName.ProxiedService);

  if (!(await knex.schema.hasTable(TableName.ProxiedService))) {
    await knex.schema.createTable(TableName.ProxiedService, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("name", 64).notNullable();
      t.string("hostPattern", 255).notNullable();
      t.boolean("isEnabled").notNullable().defaultTo(true);

      t.string("projectId", 36).notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      // Whoever last saved this service. Runtime brokering resolves secret values under this actor's
      // permissions, so the value fetch doubles as the authorization check: if they lose Read Value or
      // leave the org, the bundle fails closed. SET NULL rather than NO ACTION so removing an org member
      // is never blocked; the label is a snapshot so the failure can still name a human afterwards.
      t.string("configuredByActorType", 16).notNullable();
      t.uuid("configuredByUserId");
      t.foreign("configuredByUserId").references("id").inTable(TableName.Users).onDelete("SET NULL");
      t.uuid("configuredByIdentityId");
      t.foreign("configuredByIdentityId").references("id").inTable(TableName.Identity).onDelete("SET NULL");
      t.string("configuredByLabel", 255).notNullable();
      t.datetime("configuredAt").notNullable();

      t.datetime("lastUsedAt");

      t.unique(["projectId", "name"]);

      t.timestamps(true, true, true);
    });

    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS proxied_services_configured_by_user_idx
      ON ${TableName.ProxiedService} ("configuredByUserId")
      WHERE "configuredByUserId" IS NOT NULL;
    `);
    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS proxied_services_configured_by_identity_idx
      ON ${TableName.ProxiedService} ("configuredByIdentityId")
      WHERE "configuredByIdentityId" IS NOT NULL;
    `);
    await knex.schema.raw(`
      ALTER TABLE ${TableName.ProxiedService}
      ADD CONSTRAINT proxied_services_configured_by_actor
      CHECK (
        ("configuredByActorType" = 'user' AND "configuredByUserId" IS NOT NULL AND "configuredByIdentityId" IS NULL)
        OR ("configuredByActorType" = 'identity' AND "configuredByIdentityId" IS NOT NULL AND "configuredByUserId" IS NULL)
      );
    `);

    await createOnUpdateTrigger(knex, TableName.ProxiedService);
  }

  if (!(await knex.schema.hasTable(TableName.ProxiedServiceCredential))) {
    await knex.schema.createTable(TableName.ProxiedServiceCredential, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("serviceId").notNullable();
      t.foreign("serviceId").references("id").inTable(TableName.ProxiedService).onDelete("CASCADE");
      t.index("serviceId");

      // Each credential names its own location, which is what lets one service reference secrets across
      // environments and folders. envId rather than an environment slug because a slug can be changed,
      // and rather than folderId because a project-level picker must be able to name a path that does
      // not exist yet, and a folder delete must surface as a loud resolve error instead of silently
      // cascading the credential away.
      t.uuid("envId").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      t.index("envId");
      t.string("secretPath", 1000).notNullable().defaultTo("/");
      t.index(["envId", "secretPath"]);

      t.string("secretKey", 255);
      t.string("dynamicSecretName", 255);
      t.string("dynamicSecretField", 255);

      t.string("role", 32).notNullable();

      t.string("headerName", 255);
      t.string("headerPrefix", 255);
      t.string("headerPurpose", 32);

      t.string("placeholderKey", 255);
      t.string("placeholderValue", 255);
      t.specificType("substitutionSurfaces", "text[]");

      t.timestamps(true, true, true);
    });

    await knex.schema.raw(`
      ALTER TABLE ${TableName.ProxiedServiceCredential}
      ADD CONSTRAINT proxied_service_credentials_one_source
      CHECK (("secretKey" IS NOT NULL) <> ("dynamicSecretName" IS NOT NULL));
    `);

    await createOnUpdateTrigger(knex, TableName.ProxiedServiceCredential);
  }

  if (!(await knex.schema.hasTable(TableName.AgentGateway))) {
    await knex.schema.createTable(TableName.AgentGateway, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("name", 64).notNullable();
      t.string("description", 500);

      t.string("projectId", 36).notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      // Both null means local-only, which is a valid configuration. NO ACTION rather than SET NULL:
      // deleteGatewayById already turns a foreign-key violation into a readable error and there is a
      // connected-resources surface, whereas SET NULL would silently downgrade a remote-capable agent
      // gateway to local-only and surface much later as a confusing "no Gateway assigned".
      t.uuid("gatewayId");
      t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("NO ACTION");
      t.uuid("gatewayPoolId");
      t.foreign("gatewayPoolId").references("id").inTable(TableName.GatewayPool).onDelete("NO ACTION");

      t.boolean("isLocalModeEnabled").notNullable().defaultTo(true);

      t.datetime("lastUsedAt");

      t.unique(["projectId", "name"]);

      t.timestamps(true, true, true);
    });

    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS agent_gateways_gateway_idx
      ON ${TableName.AgentGateway} ("gatewayId")
      WHERE "gatewayId" IS NOT NULL;
    `);
    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS agent_gateways_gateway_pool_idx
      ON ${TableName.AgentGateway} ("gatewayPoolId")
      WHERE "gatewayPoolId" IS NOT NULL;
    `);
    await knex.schema.raw(`
      ALTER TABLE ${TableName.AgentGateway}
      ADD CONSTRAINT agent_gateways_single_transport
      CHECK (NOT ("gatewayId" IS NOT NULL AND "gatewayPoolId" IS NOT NULL));
    `);

    await createOnUpdateTrigger(knex, TableName.AgentGateway);
  }

  if (!(await knex.schema.hasTable(TableName.AgentGatewayService))) {
    await knex.schema.createTable(TableName.AgentGatewayService, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("agentGatewayId").notNullable();
      t.foreign("agentGatewayId").references("id").inTable(TableName.AgentGateway).onDelete("CASCADE");

      t.uuid("serviceId").notNullable();
      t.foreign("serviceId").references("id").inTable(TableName.ProxiedService).onDelete("CASCADE");
      t.index("serviceId");

      // One agent gateway can reference services with overlapping host patterns. The matcher's last-resort
      // tiebreaker used to be the alphabetically-first service name, which silently picks a credential;
      // this makes the choice explicit and editable.
      t.integer("priority").notNullable().defaultTo(0);

      // agentGatewayId is the leftmost column, so this doubles as its index.
      t.unique(["agentGatewayId", "serviceId"]);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.AgentGatewayService);
  }

  // Sessions exist for credential lifecycle only: they own the dynamic-secret leases minted for a run,
  // pin the pool member a run is bound to, and give revocation something to target. This is deliberately
  // not a PAM session — no recording, no chunk upload, no session key.
  if (!(await knex.schema.hasTable(TableName.AgentGatewaySession))) {
    await knex.schema.createTable(TableName.AgentGatewaySession, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("agentGatewayId").notNullable();
      t.foreign("agentGatewayId").references("id").inTable(TableName.AgentGateway).onDelete("CASCADE");

      t.string("projectId", 36).notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      // The pool member this session is pinned to, resolved once at open. Null in local mode. Re-picking
      // per renewal would strand the session's leases and MITM state on the previous gateway.
      t.uuid("gatewayId");
      t.foreign("gatewayId").references("id").inTable(TableName.GatewayV2).onDelete("SET NULL");

      t.string("mode", 16).notNullable();
      t.string("status", 16).notNullable();

      t.uuid("actorUserId");
      t.foreign("actorUserId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.uuid("actorIdentityId");
      t.foreign("actorIdentityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
      t.string("actorName", 255).notNullable();

      t.datetime("expiresAt").notNullable();
      t.datetime("endedAt");
      t.datetime("lastResolvedAt");
      // Hash of the resolved secret-reference set, so a repeated resolve can be debounced in the audit
      // log while a resolve whose references changed is always recorded.
      t.string("resolvedRefFingerprint", 64);

      t.index(["agentGatewayId", "status"]);

      t.timestamps(true, true, true);
    });

    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS agent_gateway_sessions_gateway_idx
      ON ${TableName.AgentGatewaySession} ("gatewayId")
      WHERE "gatewayId" IS NOT NULL;
    `);
    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS agent_gateway_sessions_actor_user_idx
      ON ${TableName.AgentGatewaySession} ("actorUserId")
      WHERE "actorUserId" IS NOT NULL;
    `);
    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS agent_gateway_sessions_actor_identity_idx
      ON ${TableName.AgentGatewaySession} ("actorIdentityId")
      WHERE "actorIdentityId" IS NOT NULL;
    `);
    // Drives the expiry cron, which only ever selects active sessions.
    await knex.schema.raw(`
      CREATE INDEX IF NOT EXISTS agent_gateway_sessions_expiry_idx
      ON ${TableName.AgentGatewaySession} ("expiresAt")
      WHERE status = 'active';
    `);
    await knex.schema.raw(`
      ALTER TABLE ${TableName.AgentGatewaySession}
      ADD CONSTRAINT agent_gateway_sessions_one_actor
      CHECK (("actorUserId" IS NOT NULL) <> ("actorIdentityId" IS NOT NULL));
    `);

    await createOnUpdateTrigger(knex, TableName.AgentGatewaySession);
  }

  if (!(await knex.schema.hasTable(TableName.AgentGatewaySessionLease))) {
    await knex.schema.createTable(TableName.AgentGatewaySessionLease, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("sessionId").notNullable();
      t.foreign("sessionId").references("id").inTable(TableName.AgentGatewaySession).onDelete("CASCADE");

      t.uuid("dynamicSecretLeaseId").notNullable();
      t.foreign("dynamicSecretLeaseId").references("id").inTable(TableName.DynamicSecretLease).onDelete("CASCADE");
      t.index("dynamicSecretLeaseId");

      t.uuid("credentialId").notNullable();
      t.foreign("credentialId").references("id").inTable(TableName.ProxiedServiceCredential).onDelete("CASCADE");
      t.index("credentialId");

      // dynamic_secret_leases persists only externalEntityId, never the lease's output fields, so without
      // this the only way to answer a second bundle fetch would be to mint a fresh lease. At a 60-second
      // poll that means a new database user every minute per session, which eventually trips the
      // per-dynamic-secret lease limit and hard-fails the customer's dynamic secret. Encrypted with the
      // project data key, and reaped with the session.
      t.binary("encryptedOutput").notNullable();

      t.datetime("expiresAt").notNullable();

      // sessionId is the leftmost column, so this doubles as its index. It is also the invariant that
      // makes a lease reusable across polls instead of re-minted on every bundle fetch.
      t.unique(["sessionId", "credentialId"]);

      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.AgentGatewaySessionLease);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AgentGatewaySessionLease);
  await dropOnUpdateTrigger(knex, TableName.AgentGatewaySessionLease);

  await knex.schema.dropTableIfExists(TableName.AgentGatewaySession);
  await dropOnUpdateTrigger(knex, TableName.AgentGatewaySession);

  await knex.schema.dropTableIfExists(TableName.AgentGatewayService);
  await dropOnUpdateTrigger(knex, TableName.AgentGatewayService);

  await knex.schema.dropTableIfExists(TableName.AgentGateway);
  await dropOnUpdateTrigger(knex, TableName.AgentGateway);

  await knex.schema.dropTableIfExists(TableName.ProxiedServiceCredential);
  await dropOnUpdateTrigger(knex, TableName.ProxiedServiceCredential);

  await knex.schema.dropTableIfExists(TableName.ProxiedService);
  await dropOnUpdateTrigger(knex, TableName.ProxiedService);

  // Recreates the folder-scoped shape from 20260710162607 so a rollback leaves a schema the previous
  // release can boot against. Rows are not recoverable; the up() drop is destructive by design.
  await knex.schema.createTable(TableName.ProxiedService, (t) => {
    t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
    t.string("name").notNullable();
    t.string("hostPattern").notNullable();
    t.boolean("isEnabled").notNullable().defaultTo(true);
    t.uuid("folderId").notNullable();
    t.foreign("folderId").references("id").inTable(TableName.SecretFolder).onDelete("CASCADE");
    t.unique(["folderId", "name"]);
    t.datetime("lastUsedAt");
    t.timestamps(true, true, true);
  });
  await createOnUpdateTrigger(knex, TableName.ProxiedService);

  await knex.schema.createTable(TableName.ProxiedServiceCredential, (t) => {
    t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
    t.uuid("serviceId").notNullable();
    t.foreign("serviceId").references("id").inTable(TableName.ProxiedService).onDelete("CASCADE");
    t.index("serviceId");
    t.string("secretKey");
    t.string("role").notNullable();
    t.string("headerName");
    t.string("headerPrefix");
    t.string("headerPurpose");
    t.string("placeholderKey");
    t.string("placeholderValue");
    t.specificType("substitutionSurfaces", "text[]");
    t.string("dynamicSecretName");
    t.string("dynamicSecretField");
    t.timestamps(true, true, true);
  });
  await createOnUpdateTrigger(knex, TableName.ProxiedServiceCredential);
}
