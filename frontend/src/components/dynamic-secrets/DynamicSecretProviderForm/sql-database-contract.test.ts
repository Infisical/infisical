import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DynamicSecretProviders, SqlProviders } from "@app/hooks/api/dynamicSecret/types";
import type { VaultDatabaseRole } from "@app/hooks/api/migration/types";

import {
  getDefaultSqlPasswordRequirements,
  getSqlClientResetValues,
  getSqlDatabaseCreateDefaultValues,
  getSqlDatabaseCreatePayload,
  getSqlDatabaseEditDefaultValues,
  getSqlDatabaseEditPayload,
  getSqlDatabaseVaultImportValues,
  getSqlDefaultPort,
  normalizeSqlGatewayValueForMode,
  sqlDatabaseCreateFormSchema
} from "./providerDefinitions/sqlDatabaseContract";
import type {
  TCreateDynamicSecretProviderFormContext,
  TEditDynamicSecretProviderFormContext
} from "./types";

const environment = { id: "env-id", name: "Development", slug: "dev", position: 1 };
const createContext: TCreateDynamicSecretProviderFormContext = {
  projectSlug: "project",
  secretPath: "/folder",
  environments: [environment],
  isSingleEnvironmentMode: true
};

const validInputs = {
  client: SqlProviders.Postgres,
  host: "sql.example.com",
  port: 5432,
  database: "application",
  username: "admin",
  password: "new-password",
  creationStatement: "create user",
  revocationStatement: "drop user",
  renewStatement: "alter user",
  sslEnabled: false,
  sslRejectUnauthorized: true,
  ca: "certificate",
  gatewayId: "gateway",
  gatewayPoolId: "pool",
  passwordRequirements: getDefaultSqlPasswordRequirements(SqlProviders.Postgres)
};

const editContext = {
  projectSlug: "project",
  secretPath: "/folder",
  environment: "dev",
  dynamicSecret: {
    id: "dynamic-secret-id",
    name: "sql-secret",
    type: DynamicSecretProviders.SqlDatabase,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    defaultTTL: "1h",
    maxTTL: "24h",
    usernameTemplate: null,
    metadata: [{ key: "owner", value: "platform" }],
    inputs: {
      ...validInputs,
      password: "********",
      ca: "********",
      gatewayId: null,
      gatewayPoolId: null
    }
  }
} satisfies TEditDynamicSecretProviderFormContext;

const getVaultRole = (
  pluginName: string,
  connectionUrl: string,
  overrides: Partial<VaultDatabaseRole> = {}
): VaultDatabaseRole => ({
  name: "vault-role",
  mountPath: "database",
  db_name: "database-config",
  config: {
    plugin_name: pluginName,
    connection_details: { connection_url: connectionUrl }
  },
  ...overrides
});

describe("SQL Database provider contract", () => {
  it("preserves each SQL discriminator, default port, statements, and password length reset", () => {
    const expected = [
      [SqlProviders.Postgres, 5432, 48, "CREATE USER"],
      [SqlProviders.MySql, 3306, 48, "CREATE USER"],
      [SqlProviders.Oracle, 1521, 30, "CREATE USER"],
      [SqlProviders.MsSQL, 1433, 48, "CREATE LOGIN"]
    ] as const;

    expected.forEach(([client, port, passwordLength, statementPrefix]) => {
      const reset = getSqlClientResetValues(client);
      assert.equal(getSqlDefaultPort(client), port);
      assert.equal(reset.port, port);
      assert.equal(reset.passwordLength, passwordLength);
      assert.match(reset.creationStatement, new RegExp(`^${statementPrefix}`));
      assert.equal(typeof reset.revocationStatement, "string");
    });
  });

  it("builds the exact create discriminator, metadata, gateway, and template semantics", () => {
    const defaults = getSqlDatabaseCreateDefaultValues(createContext);
    assert.equal(defaults.inputs.client, SqlProviders.Postgres);
    assert.equal(defaults.inputs.port, 5432);
    assert.deepEqual(defaults.environment, environment);

    const payload = getSqlDatabaseCreatePayload(
      {
        ...defaults,
        name: "sql-secret",
        metadata: [{ key: "owner", value: "platform" }],
        inputs: validInputs
      },
      createContext
    );

    assert.equal(payload.provider.type, DynamicSecretProviders.SqlDatabase);
    assert.equal(payload.provider.inputs.client, SqlProviders.Postgres);
    assert.equal(payload.provider.inputs.gatewayId, "gateway");
    assert.equal(payload.environmentSlug, "dev");
    assert.equal(payload.usernameTemplate, undefined);
    assert.deepEqual(payload.metadata, [{ key: "owner", value: "platform" }]);
  });

  it("hydrates masked edit secrets and preserves rename, null gateway, and template semantics", () => {
    const values = getSqlDatabaseEditDefaultValues(editContext);
    assert.equal(values.inputs.password, "********");
    assert.equal(values.inputs.ca, "********");
    assert.equal(values.inputs.gatewayId, null);
    assert.deepEqual(values.metadata, [{ key: "owner", value: "platform" }]);

    const payload = getSqlDatabaseEditPayload(
      { ...values, name: "renamed-sql-secret", maxTTL: "" },
      editContext
    );
    const inputs = payload.data.inputs as {
      password: string;
      ca: string;
      gatewayId: null;
      gatewayPoolId: null;
    };
    assert.equal(inputs.password, "********");
    assert.equal(inputs.ca, "********");
    assert.equal(inputs.gatewayId, null);
    assert.equal(inputs.gatewayPoolId, null);
    assert.equal(payload.data.newName, "renamed-sql-secret");
    assert.equal(payload.data.maxTTL, undefined);
    assert.equal(payload.data.usernameTemplate, null);
  });

  it("keeps validation messages and mode-specific cleared gateway values", () => {
    const defaults = getSqlDatabaseCreateDefaultValues(createContext);
    const result = sqlDatabaseCreateFormSchema.safeParse({
      ...defaults,
      name: "sql-secret",
      inputs: {
        ...validInputs,
        passwordRequirements: {
          length: 2,
          required: { lowercase: 1, uppercase: 1, digits: 1, symbols: 0 }
        }
      }
    });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(
        result.error.issues.at(-1)?.message,
        "Sum of required characters cannot exceed the total length"
      );
    }
    assert.equal(normalizeSqlGatewayValueForMode("create", null), undefined);
    assert.equal(normalizeSqlGatewayValueForMode("edit", null), null);
  });

  it("maps Vault connection formats, explicit usernames, statements, CA, and TTLs", () => {
    const mysql = getSqlDatabaseVaultImportValues(
      getVaultRole("mysql-database-plugin", "user:pass@tcp(mysql.internal:3307)/app")
    );
    assert.deepEqual(mysql.inputs, {
      client: SqlProviders.MySql,
      host: "mysql.internal",
      port: 3307,
      database: "app"
    });

    const oracle = getSqlDatabaseVaultImportValues(
      getVaultRole("oracle-database-plugin", "user/pass@//oracle.internal:1522/service")
    );
    assert.equal(oracle.inputs.client, SqlProviders.Oracle);
    assert.equal(oracle.inputs.host, "oracle.internal");
    assert.equal(oracle.inputs.port, 1522);
    assert.equal(oracle.inputs.database, "service");

    const mssqlRole = getVaultRole(
      "mssql-database-plugin",
      "sqlserver://url-user:pass@mssql.internal:1434?databaseName=app",
      {
        default_ttl: 3600,
        max_ttl: 86400,
        creation_statements: ["CREATE LOGIN {{name}}"],
        revocation_statements: ["DROP LOGIN {{name}}"],
        renew_statements: ["ALTER LOGIN {{name}}"],
        config: {
          plugin_name: "mssql-database-plugin",
          connection_details: {
            connection_url: "sqlserver://url-user:pass@mssql.internal:1434?databaseName=app",
            username: "explicit-user",
            tls_ca: "vault-ca"
          }
        }
      }
    );
    const mssql = getSqlDatabaseVaultImportValues(mssqlRole);
    assert.equal(mssql.inputs.client, SqlProviders.MsSQL);
    assert.equal(mssql.inputs.username, "explicit-user");
    assert.equal(mssql.inputs.ca, "vault-ca");
    assert.equal(mssql.inputs.creationStatement, "CREATE LOGIN {{username}}");
    assert.equal(mssql.inputs.revocationStatement, "DROP LOGIN {{username}}");
    assert.equal(mssql.inputs.renewStatement, "ALTER LOGIN {{username}}");
    assert.equal(mssql.defaultTTL, "3600s");
    assert.equal(mssql.maxTTL, "86400s");
    assert.equal(mssql.connectionUrlParseFailed, false);

    const invalid = getSqlDatabaseVaultImportValues(
      getVaultRole("postgresql-database-plugin", "not a URL")
    );
    assert.equal(invalid.connectionUrlParseFailed, true);
  });
});
