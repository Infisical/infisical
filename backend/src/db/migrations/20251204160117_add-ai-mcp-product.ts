import { Knex } from "knex";

import { TableName } from "../schemas";
import { createOnUpdateTrigger, dropOnUpdateTrigger } from "../utils";

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(TableName.AiMcpServer))) {
    await knex.schema.createTable(TableName.AiMcpServer, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("url").notNullable();
      t.string("description");
      t.string("status");
      t.string("credentialMode");
      t.string("authMethod");
      t.binary("encryptedCredentials");
      t.binary("encryptedOauthConfig"); // Stores client ID/secret for OAuth servers without DCR
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.AiMcpServer);
  }

  if (!(await knex.schema.hasTable(TableName.AiMcpServerTool))) {
    await knex.schema.createTable(TableName.AiMcpServerTool, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.text("description");
      t.jsonb("inputSchema");
      t.uuid("aiMcpServerId").notNullable();
      t.foreign("aiMcpServerId").references("id").inTable(TableName.AiMcpServer).onDelete("CASCADE");
    });
  }

  if (!(await knex.schema.hasTable(TableName.AiMcpEndpoint))) {
    await knex.schema.createTable(TableName.AiMcpEndpoint, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("name").notNullable();
      t.string("description");
      t.string("status");
      t.boolean("piiFiltering").defaultTo(false).notNullable();
      t.string("projectId").notNullable();
      t.foreign("projectId").references("id").inTable(TableName.Project).onDelete("CASCADE");
      t.timestamps(true, true, true);
    });

    await createOnUpdateTrigger(knex, TableName.AiMcpEndpoint);
  }

  if (!(await knex.schema.hasTable(TableName.AiMcpEndpointServer))) {
    await knex.schema.createTable(TableName.AiMcpEndpointServer, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("aiMcpEndpointId").notNullable();
      t.foreign("aiMcpEndpointId").references("id").inTable(TableName.AiMcpEndpoint).onDelete("CASCADE");
      t.uuid("aiMcpServerId").notNullable();
      t.foreign("aiMcpServerId").references("id").inTable(TableName.AiMcpServer).onDelete("CASCADE");
      t.unique(["aiMcpEndpointId", "aiMcpServerId"]);
    });
  }

  if (!(await knex.schema.hasTable(TableName.AiMcpEndpointServerTool))) {
    await knex.schema.createTable(TableName.AiMcpEndpointServerTool, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("aiMcpEndpointId").notNullable();
      t.foreign("aiMcpEndpointId").references("id").inTable(TableName.AiMcpEndpoint).onDelete("CASCADE");
      t.uuid("aiMcpServerToolId").notNullable();
      t.foreign("aiMcpServerToolId").references("id").inTable(TableName.AiMcpServerTool).onDelete("CASCADE");
      t.boolean("isEnabled").defaultTo(false).notNullable();
      t.unique(["aiMcpEndpointId", "aiMcpServerToolId"]);
    });
  }

  // Store user OAuth credentials for MCP servers with "personal" credential mode
  if (!(await knex.schema.hasTable(TableName.AiMcpServerUserCredential))) {
    await knex.schema.createTable(TableName.AiMcpServerUserCredential, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.uuid("userId").notNullable();
      t.foreign("userId").references("id").inTable(TableName.Users).onDelete("CASCADE");
      t.uuid("aiMcpServerId").notNullable();
      t.foreign("aiMcpServerId").references("id").inTable(TableName.AiMcpServer).onDelete("CASCADE");
      t.binary("encryptedCredentials").notNullable();
      t.timestamps(true, true, true);
      t.unique(["userId", "aiMcpServerId"]);
    });

    await createOnUpdateTrigger(knex, TableName.AiMcpServerUserCredential);
  }

  if (!(await knex.schema.hasTable(TableName.AiMcpActivityLog))) {
    await knex.schema.createTable(TableName.AiMcpActivityLog, (t) => {
      t.uuid("id", { primaryKey: true }).defaultTo(knex.fn.uuid());
      t.string("projectId").notNullable();
      t.string("endpointName").notNullable();
      t.string("serverName").notNullable();
      t.string("toolName").notNullable();
      t.string("actor").notNullable();
      t.jsonb("request").notNullable();
      t.jsonb("response").notNullable();
      t.timestamps(true, true, true);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  // await dropOnUpdateTrigger(knex, TableName.AiMcpServerUserCredential);
  await knex.schema.dropTableIfExists(TableName.AiMcpServerUserCredential);

  await knex.schema.dropTableIfExists(TableName.AiMcpEndpointServerTool);
  await knex.schema.dropTableIfExists(TableName.AiMcpEndpointServer);

  await dropOnUpdateTrigger(knex, TableName.AiMcpEndpoint);
  await knex.schema.dropTableIfExists(TableName.AiMcpEndpoint);

  await knex.schema.dropTableIfExists(TableName.AiMcpServerTool);

  await dropOnUpdateTrigger(knex, TableName.AiMcpServer);
  await knex.schema.dropTableIfExists(TableName.AiMcpServer);

  await knex.schema.dropTableIfExists(TableName.AiMcpActivityLog);
}
