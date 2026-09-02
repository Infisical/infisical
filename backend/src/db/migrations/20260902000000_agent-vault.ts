import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

// Agent Vault: an access bundle is a named set of connections (host patterns + a credential), granted to
// users/identities/groups through its own membership table, and minted into a session whose token an agent's
// proxy exchanges for decrypted credentials.
export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AgentVaultAccessBundle))) {
    await knex.schema.createTable(TableName.AgentVaultAccessBundle, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      // The per-org internal Agent Vault project, as every other product-scoped table does.
      t.string("projectId", 36).notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      t.string("name", 64).notNullable();
      t.string("description", 256);
      t.timestamps(true, true, true);

      // Also covers the projectId FK and the list page's ORDER BY name.
      t.unique(["projectId", "name"]);
    });

    await createOnUpdateTrigger(knex, TableName.AgentVaultAccessBundle);
  }

  if (!(await knex.schema.hasTable(TableName.AgentVaultConnection))) {
    await knex.schema.createTable(TableName.AgentVaultConnection, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("accessBundleId").notNullable();
      t.foreign("accessBundleId").references("id").inTable(TableName.AgentVaultAccessBundle).onDelete("CASCADE");

      t.string("name", 64).notNullable();

      // One column holding a comma-separated set of host:port patterns, matching proxied_services.hostPattern.
      t.string("hostPattern", 1024).notNullable();

      t.string("credentialType", 32).notNullable();

      // Non-secret half of the credential (header name, prefix, username). Read on every list page without a
      // decrypt. No DB default: the service validates it per credential type and always writes it.
      t.jsonb("credentialConfig").notNullable();

      // NULL exactly when credentialType is passthrough; enforced in the service, not by a CHECK, so the
      // deferred credential types can land without a constraint migration.
      t.binary("encryptedCredential");

      t.timestamps(true, true, true);

      t.unique(["accessBundleId", "name"]);
    });

    await knex.raw(
      `ALTER TABLE "${TableName.AgentVaultConnection}" ADD CONSTRAINT "agent_vault_connections_credential_type_check" CHECK ("credentialType" IN ('bearer', 'basic', 'passthrough'))`
    );

    await createOnUpdateTrigger(knex, TableName.AgentVaultConnection);
  }

  if (!(await knex.schema.hasTable(TableName.AgentVaultAccessBundleMember))) {
    await knex.schema.createTable(TableName.AgentVaultAccessBundleMember, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("accessBundleId").notNullable();
      t.foreign("accessBundleId").references("id").inTable(TableName.AgentVaultAccessBundle).onDelete("CASCADE");
      // "Who can reach this bundle" — the members card and the mint-time reachability check.
      t.index("accessBundleId");

      t.uuid("userId");
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.uuid("identityId");
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");

      t.uuid("groupId");
      t.foreign("groupId").references("id").inTable(TableName.Groups).onDelete("CASCADE");

      t.timestamps(true, true, true);
    });

    await knex.raw(
      `ALTER TABLE "${TableName.AgentVaultAccessBundleMember}" ADD CONSTRAINT "agent_vault_access_bundle_members_one_actor" CHECK (num_nonnulls("userId", "identityId", "groupId") = 1)`
    );

    // Partial uniques rather than a composite one, since two of the three columns are always NULL.
    await knex.raw(
      `CREATE UNIQUE INDEX agent_vault_bundle_member_user ON "${TableName.AgentVaultAccessBundleMember}" ("accessBundleId", "userId") WHERE "userId" IS NOT NULL`
    );
    await knex.raw(
      `CREATE UNIQUE INDEX agent_vault_bundle_member_identity ON "${TableName.AgentVaultAccessBundleMember}" ("accessBundleId", "identityId") WHERE "identityId" IS NOT NULL`
    );
    await knex.raw(
      `CREATE UNIQUE INDEX agent_vault_bundle_member_group ON "${TableName.AgentVaultAccessBundleMember}" ("accessBundleId", "groupId") WHERE "groupId" IS NOT NULL`
    );

    // The three reverse lookups the session resolve hot path runs, one per actor kind.
    await knex.raw(
      `CREATE INDEX agent_vault_bundle_member_by_user ON "${TableName.AgentVaultAccessBundleMember}" ("userId") WHERE "userId" IS NOT NULL`
    );
    await knex.raw(
      `CREATE INDEX agent_vault_bundle_member_by_identity ON "${TableName.AgentVaultAccessBundleMember}" ("identityId") WHERE "identityId" IS NOT NULL`
    );
    await knex.raw(
      `CREATE INDEX agent_vault_bundle_member_by_group ON "${TableName.AgentVaultAccessBundleMember}" ("groupId") WHERE "groupId" IS NOT NULL`
    );

    await createOnUpdateTrigger(knex, TableName.AgentVaultAccessBundleMember);
  }

  if (!(await knex.schema.hasTable(TableName.AgentVaultSession))) {
    await knex.schema.createTable(TableName.AgentVaultSession, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId", 36).notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      // CASCADE, not SET NULL: deleting the actor takes their sessions with it and the next resolve 404s.
      t.uuid("userId");
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");

      t.uuid("identityId");
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");

      // sha256 hex of the token, which is itself the lookup key. The token is never stored.
      t.string("tokenHash", 64).notNullable().unique();

      t.timestamp("expiresAt", { useTz: true }); // NULL means never
      t.timestamp("revokedAt", { useTz: true });

      // sha256 of the last returned connection-id set, so session-resolve is audited on change, not per poll.
      t.string("lastResolvedHash", 64);

      t.timestamps(true, true, true);

      t.index(["projectId", "createdAt"]);
    });

    await knex.raw(
      `ALTER TABLE "${TableName.AgentVaultSession}" ADD CONSTRAINT "agent_vault_sessions_one_actor" CHECK (num_nonnulls("userId", "identityId") = 1)`
    );

    await knex.raw(
      `CREATE INDEX agent_vault_session_by_user ON "${TableName.AgentVaultSession}" ("userId") WHERE "userId" IS NOT NULL`
    );
    await knex.raw(
      `CREATE INDEX agent_vault_session_by_identity ON "${TableName.AgentVaultSession}" ("identityId") WHERE "identityId" IS NOT NULL`
    );

    // The two halves of the retention sweep.
    await knex.raw(
      `CREATE INDEX agent_vault_session_expires_at ON "${TableName.AgentVaultSession}" ("expiresAt") WHERE "expiresAt" IS NOT NULL`
    );
    await knex.raw(
      `CREATE INDEX agent_vault_session_revoked_at ON "${TableName.AgentVaultSession}" ("revokedAt") WHERE "revokedAt" IS NOT NULL`
    );

    await createOnUpdateTrigger(knex, TableName.AgentVaultSession);
  }

  if (!(await knex.schema.hasTable(TableName.AgentVaultSessionAccessBundle))) {
    await knex.schema.createTable(TableName.AgentVaultSessionAccessBundle, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.uuid("sessionId").notNullable();
      t.foreign("sessionId").references("id").inTable(TableName.AgentVaultSession).onDelete("CASCADE");
      t.index("sessionId");

      // SET NULL, not CASCADE: a deleted bundle contributes no connections but the session still reads.
      t.uuid("accessBundleId");
      t.foreign("accessBundleId").references("id").inTable(TableName.AgentVaultAccessBundle).onDelete("SET NULL");
      t.index("accessBundleId");

      t.string("accessBundleName", 64).notNullable();

      // 0-based, the order bundles were named at mint. Breaks ties when two bundles cover the same host.
      t.integer("position").notNullable();

      // Insert-only, so no updatedAt and no trigger.
      t.timestamp("createdAt", { useTz: true }).notNullable().defaultTo(knex.fn.now());

      t.unique(["sessionId", "position"]);
    });

    await knex.raw(
      `CREATE UNIQUE INDEX agent_vault_session_bundle_unique ON "${TableName.AgentVaultSessionAccessBundle}" ("sessionId", "accessBundleId") WHERE "accessBundleId" IS NOT NULL`
    );
  }

  if (!(await knex.schema.hasTable(TableName.AgentVaultProxy))) {
    await knex.schema.createTable(TableName.AgentVaultProxy, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());

      t.string("projectId", 36).notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");

      t.string("name", 64).notNullable();

      // Bumped on enroll and by the revoke route; the only kill switch for an issued proxy token.
      t.integer("tokenVersion").notNullable().defaultTo(0);

      // Only the two public facts about the proxy's self-signed CA, derived once at enrollment. The
      // certificate itself is not stored: the agent fetches it from the proxy's own listener, so a copy
      // here would have no reader. The fingerprint is what an operator pins; the expiry is what warns
      // them a CA is ageing out.
      t.string("rootCaFingerprint", 102);
      t.timestamp("rootCaExpiresAt", { useTz: true });

      // Last successful heartbeat. Health is derived (heartbeat > now() - pollInterval * 3), never stored.
      t.timestamp("heartbeat", { useTz: true });
      t.string("version", 32);

      t.string("unmatchedHost", 16).notNullable().defaultTo("allow");
      t.string("bypassHosts", 1024);
      t.integer("pollInterval").notNullable().defaultTo(60);

      t.timestamps(true, true, true);

      t.unique(["projectId", "name"]);
    });

    await knex.raw(
      `ALTER TABLE "${TableName.AgentVaultProxy}" ADD CONSTRAINT "agent_vault_proxies_unmatched_host_check" CHECK ("unmatchedHost" IN ('allow', 'deny'))`
    );
    await knex.raw(
      `ALTER TABLE "${TableName.AgentVaultProxy}" ADD CONSTRAINT "agent_vault_proxies_poll_interval_check" CHECK ("pollInterval" BETWEEN 10 AND 300)`
    );

    await createOnUpdateTrigger(knex, TableName.AgentVaultProxy);
  }

  // Same nullable-FK-per-resource-type pattern as gatewayId / relayId / kmipServerId.
  if (await knex.schema.hasTable(TableName.ResourceAuthMethod)) {
    const hasAgentVaultProxyId = await knex.schema.hasColumn(TableName.ResourceAuthMethod, "agentVaultProxyId");
    if (!hasAgentVaultProxyId) {
      await knex.schema.alterTable(TableName.ResourceAuthMethod, (t) => {
        t.uuid("agentVaultProxyId").nullable();
        t.foreign("agentVaultProxyId").references("id").inTable(TableName.AgentVaultProxy).onDelete("CASCADE");
      });

      await knex.schema.raw(`
        CREATE UNIQUE INDEX one_method_per_agent_vault_proxy
        ON ${TableName.ResourceAuthMethod} ("agentVaultProxyId")
        WHERE "agentVaultProxyId" IS NOT NULL
      `);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable(TableName.ResourceAuthMethod)) {
    const hasAgentVaultProxyId = await knex.schema.hasColumn(TableName.ResourceAuthMethod, "agentVaultProxyId");
    if (hasAgentVaultProxyId) {
      await knex.schema.raw(`DROP INDEX IF EXISTS one_method_per_agent_vault_proxy`);
      await knex.schema.alterTable(TableName.ResourceAuthMethod, (t) => {
        t.dropColumn("agentVaultProxyId");
      });
    }
  }

  await dropOnUpdateTrigger(knex, TableName.AgentVaultProxy);
  await knex.schema.dropTableIfExists(TableName.AgentVaultProxy);

  await knex.schema.dropTableIfExists(TableName.AgentVaultSessionAccessBundle);

  await dropOnUpdateTrigger(knex, TableName.AgentVaultSession);
  await knex.schema.dropTableIfExists(TableName.AgentVaultSession);

  await dropOnUpdateTrigger(knex, TableName.AgentVaultAccessBundleMember);
  await knex.schema.dropTableIfExists(TableName.AgentVaultAccessBundleMember);

  await dropOnUpdateTrigger(knex, TableName.AgentVaultConnection);
  await knex.schema.dropTableIfExists(TableName.AgentVaultConnection);

  await dropOnUpdateTrigger(knex, TableName.AgentVaultAccessBundle);
  await knex.schema.dropTableIfExists(TableName.AgentVaultAccessBundle);
}
