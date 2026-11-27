import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { DynamicSecretProviders, NamespaceAuthType } from "@app/hooks/api/dynamicSecret/types";

import {
  getNamespaceCreateDefaultValues,
  getNamespaceCreatePayload,
  getNamespaceEditDefaultValues,
  getNamespaceEditPayload,
  NAMESPACE_DEFAULT_AUDIENCE,
  namespaceCreateFormSchema,
  namespaceEditFormSchema,
  namespaceTrustRelationshipCommand,
  TNamespaceFormValues
} from "./providerDefinitions/namespaceContract";
import type {
  TCreateDynamicSecretProviderFormContext,
  TEditDynamicSecretProviderFormContext
} from "./types";

const createContext = {
  projectSlug: "project",
  secretPath: "/",
  environments: [{ name: "Development", slug: "dev" }],
  isSingleEnvironmentMode: true
} as unknown as TCreateDynamicSecretProviderFormContext;

const formValues = (inputs: Partial<TNamespaceFormValues["inputs"]>): TNamespaceFormValues => {
  const defaults = getNamespaceCreateDefaultValues(createContext);
  return {
    ...defaults,
    name: "namespace-ingress",
    inputs: {
      ...defaults.inputs,
      tenantId: "tenant_abc",
      provisionerToken: "nsrt_token",
      ...inputs
    }
  };
};

const editContext = (inputs: object): TEditDynamicSecretProviderFormContext => ({
  projectSlug: "project",
  secretPath: "/",
  environment: "dev",
  dynamicSecret: {
    id: "dynamic-secret-id",
    name: "namespace-ingress",
    type: DynamicSecretProviders.Namespace,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    defaultTTL: "1h",
    maxTTL: "24h",
    inputs
  }
});

const issuePaths = (schema: typeof namespaceCreateFormSchema, values: TNamespaceFormValues) =>
  schema.safeParse(values).error?.issues.map((issue) => issue.path.join(".")) ?? [];

const createPayloadInputs = (inputs: Partial<TNamespaceFormValues["inputs"]>) =>
  getNamespaceCreatePayload(namespaceCreateFormSchema.parse(formValues(inputs)), createContext)
    .provider.inputs;

const editPayloadInputs = (
  context: TEditDynamicSecretProviderFormContext,
  inputs: Partial<TNamespaceFormValues["inputs"]> = {}
) => {
  const values = getNamespaceEditDefaultValues(context);
  return getNamespaceEditPayload(
    namespaceEditFormSchema.parse({ ...values, inputs: { ...values.inputs, ...inputs } }),
    context
  ).data.inputs;
};

describe("Namespace dynamic secret form", () => {
  it("requires a Namespace tenant ID for federation", () => {
    const defaults = getNamespaceCreateDefaultValues(createContext);
    assert.equal(defaults.inputs.method, NamespaceAuthType.Federation);
    assert.deepEqual(issuePaths(namespaceCreateFormSchema, formValues({ tenantId: "" })), [
      "inputs.tenantId"
    ]);
    assert.deepEqual(issuePaths(namespaceCreateFormSchema, formValues({ tenantId: "acme" })), [
      "inputs.tenantId"
    ]);
  });

  it("sends only the method, tenant, and audience for federation, with the default audience when cleared", () => {
    assert.deepEqual(createPayloadInputs({ audience: "" }), {
      method: NamespaceAuthType.Federation,
      tenantId: "tenant_abc",
      audience: NAMESPACE_DEFAULT_AUDIENCE
    });
  });

  it("requires a revokable token for the provisioner-token method and sends only the token", () => {
    const token = { method: NamespaceAuthType.ProvisionerToken, tenantId: "" };
    assert.deepEqual(
      issuePaths(namespaceCreateFormSchema, formValues({ ...token, provisionerToken: "" })),
      ["inputs.provisionerToken"]
    );
    assert.deepEqual(
      issuePaths(
        namespaceCreateFormSchema,
        formValues({ ...token, provisionerToken: "nscloud_token" })
      ),
      ["inputs.provisionerToken"]
    );
    assert.deepEqual(
      issuePaths(
        namespaceCreateFormSchema,
        formValues({ ...token, tenantId: "acme", provisionerToken: "nsrt_token" })
      ),
      []
    );
    assert.deepEqual(createPayloadInputs(token), {
      method: NamespaceAuthType.ProvisionerToken,
      provisionerToken: "nsrt_token"
    });
  });

  it("keeps the stored provisioner token when left blank on edit", () => {
    assert.deepEqual(
      editPayloadInputs(editContext({ method: NamespaceAuthType.ProvisionerToken })),
      {
        method: NamespaceAuthType.ProvisionerToken
      }
    );
  });

  it("asks for a token when a federation secret switches to provisioner-token", () => {
    const values = getNamespaceEditDefaultValues(
      editContext({ method: NamespaceAuthType.Federation, tenantId: "tenant_abc" })
    );
    assert.deepEqual(
      issuePaths(namespaceEditFormSchema, {
        ...values,
        inputs: { ...values.inputs, method: NamespaceAuthType.ProvisionerToken }
      }),
      ["inputs.provisionerToken"]
    );
  });

  it("quotes every value in the trust relationship command, so a saved value can't run in the shell", () => {
    const command = namespaceTrustRelationshipCommand({
      issuerUrl: "https://app.example.com/api/v1/oidc-issuer/organizations/org-1",
      subject: "dynamic-secret:ds-1",
      audience: "https://aud.example.com/$(touch pwned)'x"
    });
    assert.match(command, /--audience 'https:\/\/aud\.example\.com\/\$\(touch pwned\)'\\''x'/);
    assert.match(command, /--subject_match 'dynamic-secret:ds-1'/);
  });
});
