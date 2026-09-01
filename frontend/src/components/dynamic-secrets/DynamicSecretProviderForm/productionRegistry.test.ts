import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { dynamicSecretProviderRegistry } from "./productionRegistry";
import { DYNAMIC_SECRET_PROVIDER_PICKER_ORDER } from "./registry";

describe("dynamicSecretProviderRegistry", () => {
  it("composes every provider exactly once in product picker order", () => {
    assert.deepEqual(dynamicSecretProviderRegistry.providers, DYNAMIC_SECRET_PROVIDER_PICKER_ORDER);
    assert.equal(dynamicSecretProviderRegistry.definitions.length, 27);
    assert.equal(new Set(dynamicSecretProviderRegistry.providers).size, 27);
    assert.equal(Object.values(DynamicSecretProviders).length, 27);
  });

  it("preserves provider labels and documentation slugs", () => {
    dynamicSecretProviderRegistry.providers.forEach((provider) => {
      assert.ok(dynamicSecretProviderRegistry.requireDefinition(provider).label);
      assert.ok(dynamicSecretProviderRegistry.getDocsSlug(provider));
    });
    assert.equal(
      dynamicSecretProviderRegistry.getDocsSlug(DynamicSecretProviders.SqlDatabase),
      "postgresql"
    );
    assert.equal(
      dynamicSecretProviderRegistry.getDocsSlug(DynamicSecretProviders.MongoAtlas),
      "mongo-atlas"
    );
  });
});
