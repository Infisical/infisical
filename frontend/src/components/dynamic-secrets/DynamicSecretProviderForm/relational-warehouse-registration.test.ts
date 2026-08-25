import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { AZURE_SQL_DATABASE_CUSTOM_RENDERER_REASONS } from "./providerDefinitions/azureSqlDatabaseContract";
import { CLICKHOUSE_CUSTOM_RENDERER_REASONS } from "./providerDefinitions/clickHouseContract";
import { RELATIONAL_WAREHOUSE_DYNAMIC_SECRET_PROVIDERS } from "./providerDefinitions/relationalWarehouseContract";
import { SAP_ASE_CUSTOM_RENDERER_REASONS } from "./providerDefinitions/sapAseContract";
import { SAP_HANA_CUSTOM_RENDERER_REASONS } from "./providerDefinitions/sapHanaContract";
import { SNOWFLAKE_CUSTOM_RENDERER_REASONS } from "./providerDefinitions/snowflakeContract";
import { SQL_DATABASE_CUSTOM_RENDERER_REASONS } from "./providerDefinitions/sqlDatabaseContract";
import { VERTICA_CUSTOM_RENDERER_REASONS } from "./providerDefinitions/verticaContract";
import type { TRegisteredDynamicSecretProviderDefinition } from "./registry";
import { createDynamicSecretProviderRegistry, defineDynamicSecretProviderModule } from "./registry";

const definitions = RELATIONAL_WAREHOUSE_DYNAMIC_SECRET_PROVIDERS.map(
  (provider) =>
    ({
      provider,
      label: provider,
      create: {
        getDefaultValues: () => ({}),
        toPayload: () => ({}),
        submitLabel: "Submit"
      },
      edit: {
        getDefaultValues: () => ({}),
        toPayload: () => ({}),
        submitLabel: "Save",
        successMessage: "Updated"
      }
    }) as unknown as TRegisteredDynamicSecretProviderDefinition
);

const relationalWarehouseContractModule = defineDynamicSecretProviderModule({
  id: "relational-warehouse-contract",
  definitions
});

describe("relational and warehouse dynamic-secret provider registration", () => {
  it("registers the seven-provider batch with create/edit parity", () => {
    assert.deepEqual(
      relationalWarehouseContractModule.definitions.map(({ provider }) => provider),
      RELATIONAL_WAREHOUSE_DYNAMIC_SECRET_PROVIDERS
    );

    relationalWarehouseContractModule.definitions.forEach((definition) => {
      assert.equal(typeof definition.create.getDefaultValues, "function");
      assert.equal(typeof definition.create.toPayload, "function");
      assert.equal(typeof definition.edit.getDefaultValues, "function");
      assert.equal(typeof definition.edit.toPayload, "function");
    });
  });

  it("composes the batch in product picker order", () => {
    const registry = createDynamicSecretProviderRegistry(relationalWarehouseContractModule);

    assert.deepEqual(registry.providers, [
      DynamicSecretProviders.SqlDatabase,
      DynamicSecretProviders.AzureSqlDatabase,
      DynamicSecretProviders.SapHana,
      DynamicSecretProviders.SapAse,
      DynamicSecretProviders.Snowflake,
      DynamicSecretProviders.Vertica,
      DynamicSecretProviders.Clickhouse
    ]);
    registry.providers.forEach((provider) => {
      assert.equal(registry.requireDefinition(provider).provider, provider);
    });
  });

  it("keeps provider-specific renderers explicit", () => {
    assert.ok(SQL_DATABASE_CUSTOM_RENDERER_REASONS.includes("import-workflow"));
    assert.ok(AZURE_SQL_DATABASE_CUSTOM_RENDERER_REASONS.includes("conditional-fields"));
    assert.ok(CLICKHOUSE_CUSTOM_RENDERER_REASONS.includes("repeatable-fields"));
    assert.ok(VERTICA_CUSTOM_RENDERER_REASONS.includes("permission-aware-fields"));
    assert.ok(SAP_ASE_CUSTOM_RENDERER_REASONS.includes("non-scalar-value"));
    assert.ok(SAP_HANA_CUSTOM_RENDERER_REASONS.includes("non-scalar-value"));
    assert.ok(SNOWFLAKE_CUSTOM_RENDERER_REASONS.includes("non-scalar-value"));
  });
});
