import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const readSource = (relativePath: string) =>
  readFile(new URL(relativePath, import.meta.url), "utf8");

describe("dynamic-secret production route cutover", () => {
  it("composes all provider families in the production registry", async () => {
    const source = await readSource("./productionRegistry.ts");

    [
      "identityAccessDynamicSecretProviders",
      "managedStoresDynamicSecretProviders",
      "relationalWarehouseDynamicSecretProviders",
      "dataProtocolDynamicSecretProviders"
    ].forEach((moduleName) => assert.match(source, new RegExp(moduleName)));
  });

  it("routes create and edit through the shared registry and form", async () => {
    const [createSource, editSource] = await Promise.all([
      readSource(
        "../../../pages/secret-manager/SecretDashboardPage/components/ActionBar/CreateDynamicSecretForm/CreateDynamicSecretForm.tsx"
      ),
      readSource(
        "../../../pages/secret-manager/SecretDashboardPage/components/DynamicSecretListView/EditDynamicSecretForm/EditDynamicSecretForm.tsx"
      )
    ]);

    [createSource, editSource].forEach((source) => {
      assert.match(source, /dynamicSecretProviderRegistry/);
      assert.match(source, /DynamicSecretProviderForm/);
    });
    assert.match(createSource, /SshDynamicSecretCreateForm/);
    assert.match(editSource, /not available in the shared provider registry/);
  });
});
