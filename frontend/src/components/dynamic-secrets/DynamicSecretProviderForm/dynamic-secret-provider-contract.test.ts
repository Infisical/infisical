import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DynamicSecretProviders,
  KubernetesDynamicSecretCredentialType
} from "@app/hooks/api/dynamicSecret/types";

import {
  getKubernetesCreateDefaultValues,
  getKubernetesCreatePayload,
  getKubernetesEditDefaultValues,
  getKubernetesEditPayload,
  getKubernetesVaultImportValues,
  KubernetesAuthMethod,
  kubernetesCreateFormSchema,
  kubernetesEditFormSchema,
  KubernetesRoleType,
  normalizeKubernetesGatewayValueForMode,
  type TKubernetesFormValues
} from "./providerDefinitions/kubernetesContract";
import {
  getMongoAtlasCreateDefaultValues,
  getMongoAtlasCreatePayload,
  getMongoAtlasEditDefaultValues,
  getMongoAtlasEditPayload,
  mongoAtlasCreateFormSchema,
  type TMongoAtlasFormValues
} from "./providerDefinitions/mongoAtlasContract";
import {
  dynamicSecretTtlSchema,
  normalizeDynamicSecretUsernameTemplateForCreate,
  normalizeDynamicSecretUsernameTemplateForEdit
} from "./schemas";
import type {
  TCreateDynamicSecretProviderDTO,
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderDefinition,
  TEditDynamicSecretProviderFormContext
} from "./types";

type TMongoCreateProvider =
  TCreateDynamicSecretProviderDTO<DynamicSecretProviders.MongoAtlas>["provider"];

const acceptMongoCreateProvider = (provider: TMongoCreateProvider) => provider;
const wrongProvider = DynamicSecretProviders.Kubernetes;
const wrongProviderInput = { type: wrongProvider, inputs: {} as never };

// @ts-expect-error -- a MongoDB Atlas definition cannot return another provider discriminator.
export const invalidMongoCreateProviderFixture = acceptMongoCreateProvider(wrongProviderInput);

type TMongoCustomRendererReasons = NonNullable<
  TDynamicSecretProviderDefinition<
    DynamicSecretProviders.MongoAtlas,
    TMongoAtlasFormValues
  >["customRenderer"]
>["reasons"];

const acceptCustomRendererReasons = (reasons: TMongoCustomRendererReasons) => reasons;
const emptyCustomRendererReasons: [] = [];

export const validCustomRendererReasonsFixture = acceptCustomRendererReasons(["repeatable-fields"]);
export const invalidCustomRendererReasonsFixture = acceptCustomRendererReasons(
  // @ts-expect-error -- a custom renderer must document at least one objective escape-hatch reason.
  emptyCustomRendererReasons
);

const environment = { id: "env-id", name: "Development", slug: "dev", position: 1 };

const createContext: TCreateDynamicSecretProviderFormContext = {
  projectSlug: "project",
  secretPath: "/folder",
  environments: [environment],
  isSingleEnvironmentMode: true
};

const getEditContext = (
  inputs: unknown,
  overrides: Partial<TEditDynamicSecretProviderFormContext["dynamicSecret"]> = {}
) =>
  ({
    projectSlug: "project",
    secretPath: "/folder",
    environment: "dev",
    dynamicSecret: {
      name: "existing-secret",
      defaultTTL: "1h",
      maxTTL: "24h",
      usernameTemplate: null,
      inputs,
      ...overrides
    }
  }) as TEditDynamicSecretProviderFormContext;

describe("shared dynamic-secret validation", () => {
  it("preserves the existing TTL bounds and messages", () => {
    const belowMinimum = dynamicSecretTtlSchema.safeParse("30s");
    const aboveMaximum = dynamicSecretTtlSchema.safeParse("11y");

    assert.equal(belowMinimum.success, false);
    assert.equal(aboveMaximum.success, false);
    if (!belowMinimum.success) {
      assert.equal(belowMinimum.error.issues[0]?.message, "TTL must be a greater than 1min");
    }
    if (!aboveMaximum.success) {
      assert.equal(aboveMaximum.error.issues[0]?.message, "TTL must be less than 10 years");
    }
  });

  it("keeps create and edit username-template nullability distinct", () => {
    assert.equal(normalizeDynamicSecretUsernameTemplateForCreate("{{randomUsername}}"), undefined);
    assert.equal(normalizeDynamicSecretUsernameTemplateForCreate("{{name}}"), "{{name}}");
    assert.equal(normalizeDynamicSecretUsernameTemplateForEdit("{{randomUsername}}"), null);
    assert.equal(normalizeDynamicSecretUsernameTemplateForEdit(""), null);
  });
});

describe("MongoDB Atlas provider contract", () => {
  const validValues: TMongoAtlasFormValues = {
    name: "atlas-secret",
    defaultTTL: "1h",
    maxTTL: "24h",
    environment,
    usernameTemplate: "{{randomUsername}}",
    inputs: {
      adminPublicKey: "public",
      adminPrivateKey: "private",
      groupId: "group",
      roles: [{ databaseName: "db", roleName: "readWrite" }],
      scopes: [{ name: "cluster", type: "CLUSTER" }]
    }
  };

  it("hydrates create and edit defaults without unmasking or inventing provider data", () => {
    const createDefaults = getMongoAtlasCreateDefaultValues(createContext);
    assert.deepEqual(createDefaults.environment, environment);
    assert.equal(createDefaults.defaultTTL, "1h");
    assert.equal(createDefaults.maxTTL, "24h");
    assert.deepEqual(createDefaults.inputs.roles, [{ databaseName: "", roleName: "" }]);

    const maskedInputs = {
      adminPublicKey: "public",
      adminPrivateKey: "********",
      groupId: "group"
    };
    const editDefaults = getMongoAtlasEditDefaultValues(getEditContext(maskedInputs));
    assert.equal(editDefaults.inputs.adminPrivateKey, "********");
    assert.equal(editDefaults.inputs.roles, undefined);
    assert.equal(editDefaults.inputs.scopes, undefined);
  });

  it("validates required credentials and at least one role", () => {
    assert.equal(mongoAtlasCreateFormSchema.safeParse(validValues).success, true);

    const invalid = mongoAtlasCreateFormSchema.safeParse({
      ...validValues,
      inputs: { ...validValues.inputs, adminPrivateKey: "", roles: [] }
    });
    assert.equal(invalid.success, false);
    if (!invalid.success) {
      assert.deepEqual(
        invalid.error.issues.map(({ path }) => path),
        [
          ["inputs", "adminPrivateKey"],
          ["inputs", "roles"]
        ]
      );
    }
  });

  it("adapts create and edit payloads while preserving rename and masking semantics", () => {
    const createPayload = getMongoAtlasCreatePayload(validValues, createContext);
    assert.equal(createPayload.provider.type, DynamicSecretProviders.MongoAtlas);
    assert.equal(createPayload.environmentSlug, "dev");
    assert.equal(createPayload.usernameTemplate, undefined);
    assert.deepEqual(createPayload.provider.inputs, validValues.inputs);

    const editContext = getEditContext(validValues.inputs);
    const editPayload = getMongoAtlasEditPayload(
      {
        ...validValues,
        name: "renamed-secret",
        usernameTemplate: "{{randomUsername}}",
        inputs: { ...validValues.inputs, adminPrivateKey: "********" }
      },
      editContext
    );
    assert.equal(editPayload.name, "existing-secret");
    assert.equal(editPayload.data.newName, "renamed-secret");
    assert.equal(editPayload.data.usernameTemplate, null);
    assert.equal(
      (editPayload.data.inputs as { adminPrivateKey?: string }).adminPrivateKey,
      "********"
    );
  });
});

describe("Kubernetes provider contract", () => {
  const validStaticValues: TKubernetesFormValues = {
    name: "kubernetes-secret",
    defaultTTL: "1h",
    maxTTL: "24h",
    environment,
    usernameTemplate: "{{randomUsername}}",
    inputs: {
      url: "https://kubernetes.example.com",
      clusterToken: "masked-or-new-token",
      ca: "certificate",
      sslEnabled: true,
      sslRejectUnauthorized: true,
      credentialType: KubernetesDynamicSecretCredentialType.Static,
      serviceAccountName: "service-account",
      namespace: "default",
      audiences: ["api"],
      authMethod: KubernetesAuthMethod.Api
    }
  };

  it("hydrates mode defaults and retains edit secret values", () => {
    const createDefaults = getKubernetesCreateDefaultValues(createContext);
    assert.deepEqual(createDefaults.environment, environment);
    assert.equal(createDefaults.defaultTTL, "1h");
    assert.equal(createDefaults.maxTTL, "24h");
    assert.equal(
      createDefaults.inputs.credentialType,
      KubernetesDynamicSecretCredentialType.Static
    );
    assert.equal(createDefaults.inputs.roleType, KubernetesRoleType.ClusterRole);

    const maskedInputs = { ...validStaticValues.inputs, clusterToken: "********" };
    const editDefaults = getKubernetesEditDefaultValues(getEditContext(maskedInputs));
    assert.equal(editDefaults.inputs.clusterToken, "********");
    assert.equal(editDefaults.usernameTemplate, "{{randomUsername}}");
  });

  it("preserves API, gateway, static, and dynamic conditional validation", () => {
    assert.equal(kubernetesCreateFormSchema.safeParse(validStaticValues).success, true);

    const missingApiValues = kubernetesCreateFormSchema.safeParse({
      ...validStaticValues,
      inputs: { ...validStaticValues.inputs, url: "", clusterToken: "" }
    });
    assert.equal(missingApiValues.success, false);
    if (!missingApiValues.success) {
      assert.deepEqual(
        missingApiValues.error.issues.map(({ path }) => path),
        [
          ["inputs", "clusterToken"],
          ["inputs", "url"]
        ]
      );
    }

    const validGatewayValues = {
      ...validStaticValues,
      inputs: {
        ...validStaticValues.inputs,
        authMethod: KubernetesAuthMethod.Gateway,
        gatewayId: "gateway-id",
        url: "",
        clusterToken: ""
      }
    };
    assert.equal(kubernetesCreateFormSchema.safeParse(validGatewayValues).success, true);

    const invalidDynamicValues = kubernetesCreateFormSchema.safeParse({
      ...validStaticValues,
      inputs: {
        ...validGatewayValues.inputs,
        credentialType: KubernetesDynamicSecretCredentialType.Dynamic,
        namespace: "one,,two",
        roleType: KubernetesRoleType.ClusterRole,
        role: ""
      }
    });
    assert.equal(invalidDynamicValues.success, false);
    if (!invalidDynamicValues.success) {
      assert.deepEqual(
        invalidDynamicValues.error.issues.map(({ path }) => path),
        [
          ["inputs", "namespace"],
          ["inputs", "role"]
        ]
      );
    }
  });

  it("normalizes cleared gateway values for each mode before schema validation", () => {
    const createGatewayId = normalizeKubernetesGatewayValueForMode("create", null);
    const editGatewayId = normalizeKubernetesGatewayValueForMode("edit", null);

    assert.equal(createGatewayId, undefined);
    assert.equal(editGatewayId, null);
    assert.equal(
      kubernetesCreateFormSchema.safeParse({
        ...validStaticValues,
        inputs: {
          ...validStaticValues.inputs,
          gatewayId: createGatewayId,
          gatewayPoolId: normalizeKubernetesGatewayValueForMode("create", null)
        }
      }).success,
      true
    );
    assert.equal(
      kubernetesEditFormSchema.safeParse({
        ...validStaticValues,
        inputs: {
          ...validStaticValues.inputs,
          gatewayId: editGatewayId,
          gatewayPoolId: normalizeKubernetesGatewayValueForMode("edit", null)
        }
      }).success,
      true
    );
  });

  it("adapts create/edit payloads and keeps masked edit credentials intact", () => {
    const createPayload = getKubernetesCreatePayload(validStaticValues, createContext);
    assert.equal(createPayload.provider.type, DynamicSecretProviders.Kubernetes);
    assert.equal(createPayload.environmentSlug, "dev");
    assert.equal(createPayload.usernameTemplate, undefined);

    const editPayload = getKubernetesEditPayload(
      {
        ...validStaticValues,
        name: "renamed-secret",
        inputs: { ...validStaticValues.inputs, clusterToken: "********" }
      },
      getEditContext(validStaticValues.inputs)
    );
    assert.equal(editPayload.data.newName, "renamed-secret");
    assert.equal(editPayload.data.usernameTemplate, null);
    assert.equal((editPayload.data.inputs as { clusterToken?: string }).clusterToken, "********");
  });

  it("maps Vault static and dynamic roles without flattening their semantics", () => {
    const baseRole = {
      name: "vault-role",
      token_default_ttl: 60,
      token_max_ttl: 120,
      token_default_audiences: ["api"],
      config: {
        kubernetes_host: "https://kubernetes.example.com",
        kubernetes_ca_cert: "certificate"
      }
    };
    const staticImport = getKubernetesVaultImportValues({
      ...baseRole,
      service_account_name: "service-account",
      allowed_kubernetes_namespaces: ["default"]
    } as never);
    const dynamicImport = getKubernetesVaultImportValues({
      ...baseRole,
      service_account_name: "",
      allowed_kubernetes_namespaces: ["one", "two"],
      kubernetes_role_name: "reader",
      kubernetes_role_type: "ClusterRole"
    } as never);
    const sparseImport = getKubernetesVaultImportValues({
      ...baseRole,
      config: { kubernetes_host: "https://kubernetes.example.com" },
      token_default_audiences: []
    } as never);

    assert.equal(staticImport.inputs.credentialType, KubernetesDynamicSecretCredentialType.Static);
    assert.equal(staticImport.inputs.namespace, "default");
    assert.equal(
      dynamicImport.inputs.credentialType,
      KubernetesDynamicSecretCredentialType.Dynamic
    );
    assert.equal(dynamicImport.inputs.namespace, "one, two");
    assert.equal(dynamicImport.inputs.roleType, KubernetesRoleType.ClusterRole);
    assert.deepEqual(sparseImport.inputs, { url: "https://kubernetes.example.com" });
  });
});
