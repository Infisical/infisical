import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  DynamicSecretProviders,
  OAuth2ClientAuthMethod,
  OAuth2GrantType
} from "@app/hooks/api/dynamicSecret/types";

import {
  getOAuth2EditDefaultValues,
  getOAuth2EditPayload
} from "./providerDefinitions/oauth2Contract";
import type { TEditDynamicSecretProviderFormContext } from "./types";

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

  it("sends a cleared scope as an empty string so the stored one is replaced", () => {
    const payload = getOAuth2EditPayload(editValues, editContext);
    assert.equal((payload.data.inputs as { scope?: string }).scope, "");
  });

  it("hydrates the stored auth method on edit", () => {
    const defaults = getOAuth2EditDefaultValues(editContext);
    assert.equal(defaults.inputs.clientAuth.method, OAuth2ClientAuthMethod.ClientSecretPost);
  });
});
