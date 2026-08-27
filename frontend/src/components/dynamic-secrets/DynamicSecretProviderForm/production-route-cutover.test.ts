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
    assert.match(createSource, /DynamicSecretProviderSelect/);
    assert.match(createSource, /sm:max-w-\[1500px\]/);
    assert.match(createSource, /onBack={requestBack}/);
    assert.match(createSource, /onCancel={requestClose}/);
    assert.match(editSource, /not available in the shared provider registry/);
  });

  it("uses Combobox for every searchable selector in the shared provider forms", async () => {
    const sources = await Promise.all([
      readSource("./DynamicSecretProviderForm.tsx"),
      readSource("./providerDefinitions/azureEntraId.tsx"),
      readSource("./providerDefinitions/ibmApiConnect.tsx")
    ]);

    sources.forEach((source) => {
      assert.match(source, /Combobox/);
      assert.doesNotMatch(source, /FilterableSelect/);
    });
  });

  it("keeps shared provider dependencies on v3 components and semantic colors", async () => {
    const [permissionSource, gatewaySource, secretInputSource] = await Promise.all([
      readSource("../../permissions/OrgPermissionCan.tsx"),
      readSource("../../v3/platform/GatewayPicker/GatewayPicker.tsx"),
      readSource("../../v3/platform/SecretInput/SecretInput.tsx")
    ]);

    assert.doesNotMatch(permissionSource, /components\/v2|from "\.\.\/v2"/);
    [gatewaySource, secretInputSource].forEach((source) => {
      assert.doesNotMatch(
        source,
        /(?:bg|border|decoration|fill|ring|stroke|text)-(?:bunker|mineshaft|primary|yellow)/
      );
    });
  });
});
