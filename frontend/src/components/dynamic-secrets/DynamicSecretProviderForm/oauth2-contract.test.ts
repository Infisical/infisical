import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  DynamicSecretProviders,
  OAuth2ClientAuthMethod,
  OAuth2GrantType
} from "@app/hooks/api/dynamicSecret/types";

import {
  getOAuth2CreateDefaultValues,
  getOAuth2CreatePayload,
  getOAuth2EditDefaultValues,
  getOAuth2EditPayload,
  OAUTH2_CUSTOM_RENDERER_REASONS,
  oauth2CreateFormSchema,
  oauth2EditFormSchema
} from "./providerDefinitions/oauth2Contract";
import { testDynamicSecretProviderContract } from "./providerContractTestHarness";
import type {
  TCreateDynamicSecretProviderFormContext,
  TEditDynamicSecretProviderFormContext
} from "./types";
import { defineDynamicSecretProvider } from "./types";

const environment = { id: "env-id", name: "Development", slug: "dev", position: 1 };
const createContext: TCreateDynamicSecretProviderFormContext = {
  projectSlug: "project",
  secretPath: "/folder",
  environments: [environment],
  isSingleEnvironmentMode: true
};

const storedInputs = {
  grantType: OAuth2GrantType.ClientCredentials,
  tokenUrl: "https://auth.example.com/oauth2/token",
  revocationUrl: "https://auth.example.com/oauth2/revoke",
  clientId: "client-id",
  clientAuth: { method: OAuth2ClientAuthMethod.ClientSecretPost },
  scope: "read write",
  extraParams: [{ key: "audience", value: "https://api.example.com" }]
};

const editContext: TEditDynamicSecretProviderFormContext = {
  projectSlug: "project",
  secretPath: "/folder",
  environment: "dev",
  dynamicSecret: {
    id: "dynamic-secret-id",
    name: "existing-secret",
    type: DynamicSecretProviders.OAuth2,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    defaultTTL: "30m",
    maxTTL: "1h",
    inputs: storedInputs
  }
};

const NoopRenderer = () => null;

const oauth2DynamicSecretProvider = defineDynamicSecretProvider({
  provider: DynamicSecretProviders.OAuth2,
  label: "OAuth 2.0",
  customRenderer: { reasons: OAUTH2_CUSTOM_RENDERER_REASONS, Component: NoopRenderer },
  create: {
    schema: oauth2CreateFormSchema,
    getDefaultValues: getOAuth2CreateDefaultValues,
    toPayload: getOAuth2CreatePayload,
    submitLabel: "Submit"
  },
  edit: {
    schema: oauth2EditFormSchema,
    getDefaultValues: getOAuth2EditDefaultValues,
    toPayload: getOAuth2EditPayload,
    submitLabel: "Submit",
    successMessage: "Successfully updated dynamic secret"
  }
});

const createDefaults = {
  name: "",
  defaultTTL: "30m",
  maxTTL: "1h",
  environment,
  inputs: {
    grantType: OAuth2GrantType.ClientCredentials,
    tokenUrl: "",
    revocationUrl: "",
    clientId: "",
    clientAuth: { method: OAuth2ClientAuthMethod.ClientSecretBasic, clientSecret: "" },
    scope: "",
    extraParams: []
  }
};

const createValues = {
  ...createDefaults,
  name: "oauth2-secret",
  inputs: {
    ...storedInputs,
    clientAuth: { method: OAuth2ClientAuthMethod.ClientSecretBasic, clientSecret: "client-secret" },
    scope: " read  write read "
  }
};

const editValues = {
  name: "renamed-oauth2-secret",
  defaultTTL: "30m",
  maxTTL: "1h",
  inputs: {
    ...storedInputs,
    clientAuth: { method: OAuth2ClientAuthMethod.ClientSecretPost, clientSecret: "" },
    scope: ""
  }
};

testDynamicSecretProviderContract({
  name: "OAuth 2.0",
  definition: oauth2DynamicSecretProvider,
  create: {
    context: createContext,
    defaultValues: createDefaults,
    validValues: createValues,
    payload: {
      provider: {
        type: DynamicSecretProviders.OAuth2,
        inputs: {
          ...storedInputs,
          clientAuth: {
            method: OAuth2ClientAuthMethod.ClientSecretBasic,
            clientSecret: "client-secret"
          },
          scope: "read write"
        }
      },
      defaultTTL: "30m",
      maxTTL: "1h",
      name: "oauth2-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev"
    },
    invalidValues: [
      {
        name: "revocation URL is not a URL",
        values: { ...createValues, inputs: { ...createValues.inputs, revocationUrl: "revoke" } },
        issuePaths: [["inputs", "revocationUrl"]]
      },
      {
        name: "client secret is missing",
        values: {
          ...createValues,
          inputs: {
            ...createValues.inputs,
            clientAuth: { method: OAuth2ClientAuthMethod.ClientSecretBasic, clientSecret: "" }
          }
        },
        issuePaths: [["inputs", "clientAuth", "clientSecret"]]
      },
      {
        name: "scope has characters outside RFC 6749",
        values: { ...createValues, inputs: { ...createValues.inputs, scope: 'read "write"' } },
        issuePaths: [["inputs", "scope"]]
      },
      {
        name: "extra parameter overrides a reserved parameter",
        values: {
          ...createValues,
          inputs: { ...createValues.inputs, extraParams: [{ key: "client_secret", value: "x" }] }
        },
        issuePaths: [["inputs", "extraParams", 0, "key"]]
      },
      {
        name: "extra parameter is repeated",
        values: {
          ...createValues,
          inputs: {
            ...createValues.inputs,
            extraParams: [
              { key: "audience", value: "a" },
              { key: "audience", value: "b" }
            ]
          }
        },
        issuePaths: [["inputs", "extraParams", 1, "key"]]
      }
    ]
  },
  edit: {
    context: editContext,
    defaultValues: {
      name: "existing-secret",
      defaultTTL: "30m",
      maxTTL: "1h",
      inputs: {
        ...storedInputs,
        clientAuth: { method: OAuth2ClientAuthMethod.ClientSecretPost, clientSecret: "" }
      }
    },
    validValues: editValues,
    payload: {
      name: "existing-secret",
      path: "/folder",
      projectSlug: "project",
      environmentSlug: "dev",
      data: {
        inputs: { ...storedInputs, scope: "" },
        newName: "renamed-oauth2-secret",
        defaultTTL: "30m",
        maxTTL: "1h"
      }
    }
  }
});

type TClientAuthPayload = { clientAuth: { method: string; clientSecret?: string } };

describe("OAuth 2.0 edit payload", () => {
  it("omits a blank client secret so the stored one is kept", () => {
    const payload = getOAuth2EditPayload(editValues, editContext);
    const { clientAuth } = payload.data.inputs as TClientAuthPayload;
    assert.deepEqual(clientAuth, { method: OAuth2ClientAuthMethod.ClientSecretPost });
  });

  it("sends a new client secret and auth method when they change", () => {
    const payload = getOAuth2EditPayload(
      {
        ...editValues,
        inputs: {
          ...editValues.inputs,
          clientAuth: { method: OAuth2ClientAuthMethod.ClientSecretBasic, clientSecret: "rotated" }
        }
      },
      editContext
    );
    const { clientAuth } = payload.data.inputs as TClientAuthPayload;
    assert.deepEqual(clientAuth, {
      method: OAuth2ClientAuthMethod.ClientSecretBasic,
      clientSecret: "rotated"
    });
  });

  it("hydrates the stored auth method on edit", () => {
    const defaults = getOAuth2EditDefaultValues(editContext);
    assert.equal(defaults.inputs.clientAuth.method, OAuth2ClientAuthMethod.ClientSecretPost);
  });
});
