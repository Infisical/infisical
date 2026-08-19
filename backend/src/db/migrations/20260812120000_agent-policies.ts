import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  // 1. agent_proxies — a first-class org resource, mirroring relays/kmip_servers. Enrolled via
  // resource token auth only, so there is no identityId column: the JWT is minted for this row and
  // tokenVersion is what revokes it.
  if (!(await knex.schema.hasTable(TableName.AgentProxy))) {
    await knex.schema.createTable(TableName.AgentProxy, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      t.uuid("orgId").notNullable();
      t.foreign("orgId").references("id").inTable(TableName.Organization).onDelete("CASCADE");

      t.string("name").notNullable();
      t.integer("tokenVersion").notNullable().defaultTo(0);
      t.datetime("heartbeat");
      t.datetime("healthAlertedAt");

      // Hosts that pass through with no credential even though no policy covers them, so an agent can
      // still reach package registries and model APIs under the deny-by-default rule.
      t.specificType("allowedHosts", "text[]");

      t.unique(["orgId", "name"]);
    });

    await createOnUpdateTrigger(knex, TableName.AgentProxy);
  }

  // 2. agentProxyId on resource_auth_methods — same nullable-FK-per-resource-type pattern as
  // gatewayId/relayId/kmipServerId.
  if (await knex.schema.hasTable(TableName.ResourceAuthMethod)) {
    const hasAgentProxyId = await knex.schema.hasColumn(TableName.ResourceAuthMethod, "agentProxyId");
    if (!hasAgentProxyId) {
      await knex.schema.alterTable(TableName.ResourceAuthMethod, (t) => {
        t.uuid("agentProxyId").nullable();
        t.foreign("agentProxyId").references("id").inTable(TableName.AgentProxy).onDelete("CASCADE");
      });

      await knex.schema.raw(`
        CREATE UNIQUE INDEX one_method_per_agent_proxy
        ON ${TableName.ResourceAuthMethod} ("agentProxyId")
        WHERE "agentProxyId" IS NOT NULL
      `);
    }
  }

  // 3. Marks a machine identity as an agent. Only an agent may mint a session token, and only agents
  // appear in the agent selector on a policy.
  if (!(await knex.schema.hasColumn(TableName.Identity, "isAgent"))) {
    await knex.schema.alterTable(TableName.Identity, (t) => {
      t.boolean("isAgent").notNullable().defaultTo(false);
    });
  }

  if (!(await knex.schema.hasTable(TableName.AgentPolicy))) {
    await knex.schema.createTable(TableName.AgentPolicy, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.string("name").notNullable();
      // Template key ("slack", "github", "custom"). Immutable after create: the credential slots are
      // derived from it, so changing it would orphan them.
      t.string("target").notNullable();

      t.unique(["projectId", "name"]);
    });

    await createOnUpdateTrigger(knex, TableName.AgentPolicy);
  }

  if (!(await knex.schema.hasTable(TableName.AgentPolicyAgent))) {
    await knex.schema.createTable(TableName.AgentPolicyAgent, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      t.uuid("policyId").notNullable();
      t.foreign("policyId").references("id").inTable(TableName.AgentPolicy).onDelete("CASCADE");
      t.index("policyId");

      t.uuid("identityId").notNullable();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
      t.index("identityId");

      t.unique(["policyId", "identityId"]);
    });

    await createOnUpdateTrigger(knex, TableName.AgentPolicyAgent);
  }

  if (!(await knex.schema.hasTable(TableName.AgentPolicyCredential))) {
    await knex.schema.createTable(TableName.AgentPolicyCredential, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      t.uuid("policyId").notNullable();
      t.foreign("policyId").references("id").inTable(TableName.AgentPolicy).onDelete("CASCADE");
      t.index("policyId");

      // envId rather than a slug so a renamed environment does not silently break the reference.
      t.uuid("envId").notNullable();
      t.foreign("envId").references("id").inTable(TableName.Environment).onDelete("CASCADE");
      t.index("envId");

      t.string("secretPath").notNullable().defaultTo("/");
      t.string("secretKey").notNullable();

      // Everything below is derived from the target template, never entered by the user.
      t.string("role").notNullable();
      t.string("headerName");
      t.string("headerPrefix");
      t.string("headerPurpose");
      t.string("placeholderKey");
      t.string("placeholderValue");
      t.specificType("substitutionSurfaces", "text[]");
    });

    await createOnUpdateTrigger(knex, TableName.AgentPolicyCredential);
  }

  if (!(await knex.schema.hasTable(TableName.AgentPolicyRule))) {
    await knex.schema.createTable(TableName.AgentPolicyRule, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      t.uuid("policyId").notNullable();
      t.foreign("policyId").references("id").inTable(TableName.AgentPolicy).onDelete("CASCADE");
      t.index("policyId");

      t.string("hostPattern").notNullable();
      // Empty array means every method. Rules are unordered: a request is allowed when any rule matches.
      t.specificType("methods", "text[]").notNullable();
    });

    await createOnUpdateTrigger(knex, TableName.AgentPolicyRule);
  }

  if (!(await knex.schema.hasTable(TableName.UserPolicy))) {
    await knex.schema.createTable(TableName.UserPolicy, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.string("name").notNullable();
      // Display and grouping only. Matching never consults it, and there is deliberately no FK to
      // an agent policy: "copy rules from" is a one-time copy.
      t.string("target").notNullable();

      t.unique(["projectId", "name"]);
    });

    await createOnUpdateTrigger(knex, TableName.UserPolicy);
  }

  if (!(await knex.schema.hasTable(TableName.UserPolicyUser))) {
    await knex.schema.createTable(TableName.UserPolicyUser, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      t.uuid("policyId").notNullable();
      t.foreign("policyId").references("id").inTable(TableName.UserPolicy).onDelete("CASCADE");
      t.index("policyId");

      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.index("userId");

      t.unique(["policyId", "userId"]);
    });

    await createOnUpdateTrigger(knex, TableName.UserPolicyUser);
  }

  if (!(await knex.schema.hasTable(TableName.UserPolicyRule))) {
    await knex.schema.createTable(TableName.UserPolicyRule, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      t.uuid("policyId").notNullable();
      t.foreign("policyId").references("id").inTable(TableName.UserPolicy).onDelete("CASCADE");
      t.index("policyId");

      t.string("hostPattern").notNullable();
      t.specificType("methods", "text[]").notNullable();
    });

    await createOnUpdateTrigger(knex, TableName.UserPolicyRule);
  }

  // agent_sessions — the "common token": one row per (agent identity, user, project). The token has no
  // expiry, so every FK is CASCADE and the proxy resolves policies live on each refresh. Deleting the
  // identity, the user, or the project therefore ends the session on its own.
  if (!(await knex.schema.hasTable(TableName.AgentSession))) {
    await knex.schema.createTable(TableName.AgentSession, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.timestamps(true, true, true);

      t.string("tokenHash").notNullable().unique();

      t.uuid("identityId").notNullable();
      t.foreign("identityId").references("id").inTable(TableName.Identity).onDelete("CASCADE");
      t.index("identityId");

      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.index("userId");

      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.index("projectId");

      t.datetime("revokedAt");
      t.datetime("lastUsedAt");
    });

    await createOnUpdateTrigger(knex, TableName.AgentSession);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(TableName.AgentSession);
  await dropOnUpdateTrigger(knex, TableName.AgentSession);

  await knex.schema.dropTableIfExists(TableName.UserPolicyRule);
  await dropOnUpdateTrigger(knex, TableName.UserPolicyRule);

  await knex.schema.dropTableIfExists(TableName.UserPolicyUser);
  await dropOnUpdateTrigger(knex, TableName.UserPolicyUser);

  await knex.schema.dropTableIfExists(TableName.UserPolicy);
  await dropOnUpdateTrigger(knex, TableName.UserPolicy);

  await knex.schema.dropTableIfExists(TableName.AgentPolicyRule);
  await dropOnUpdateTrigger(knex, TableName.AgentPolicyRule);

  await knex.schema.dropTableIfExists(TableName.AgentPolicyCredential);
  await dropOnUpdateTrigger(knex, TableName.AgentPolicyCredential);

  await knex.schema.dropTableIfExists(TableName.AgentPolicyAgent);
  await dropOnUpdateTrigger(knex, TableName.AgentPolicyAgent);

  await knex.schema.dropTableIfExists(TableName.AgentPolicy);
  await dropOnUpdateTrigger(knex, TableName.AgentPolicy);

  if (await knex.schema.hasColumn(TableName.Identity, "isAgent")) {
    await knex.schema.alterTable(TableName.Identity, (t) => {
      t.dropColumn("isAgent");
    });
  }

  if (await knex.schema.hasTable(TableName.ResourceAuthMethod)) {
    if (await knex.schema.hasColumn(TableName.ResourceAuthMethod, "agentProxyId")) {
      await knex.schema.raw(`DROP INDEX IF EXISTS one_method_per_agent_proxy`);
      await knex.schema.alterTable(TableName.ResourceAuthMethod, (t) => {
        t.dropColumn("agentProxyId");
      });
    }
  }

  await dropOnUpdateTrigger(knex, TableName.AgentProxy);
  await knex.schema.dropTableIfExists(TableName.AgentProxy);
}
