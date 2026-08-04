import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DynamicSecretAwsIamAuth,
  DynamicSecretAwsIamCredentialType,
  DynamicSecretProviders,
  TailscaleAuthMethod,
  TailscaleKeyAuthType
} from "@app/hooks/api/dynamicSecret/types";

import {
  getAwsIamCreateDefaultValues,
  getAwsIamCreatePayload
} from "./providerDefinitions/awsIamContract";
import {
  getAzureEntraIdCreateDefaultValues,
  getAzureEntraIdCreatePayload
} from "./providerDefinitions/azureEntraIdContract";
import {
  gcpIamCreateFormSchema,
  getGcpIamCreateDefaultValues,
  getGcpIamCreatePayload
} from "./providerDefinitions/gcpIamContract";
import {
  getGithubCreateDefaultValues,
  getGithubCreatePayload,
  getGithubEditDefaultValues
} from "./providerDefinitions/githubContract";
import {
  getLdapCreateDefaultValues,
  getLdapVaultImportValues,
  LdapCredentialType
} from "./providerDefinitions/ldapContract";
import {
  getSshCreateDefaultValues,
  getSshCreatePayload,
  sshCreateFormSchema
} from "./providerDefinitions/sshContract";
import {
  getTailscaleCreateDefaultValues,
  getTailscaleCreatePayload,
  tailscaleCreateFormSchema
} from "./providerDefinitions/tailscaleContract";
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
const editContext = (inputs: unknown): TEditDynamicSecretProviderFormContext => ({
  projectSlug: "project",
  secretPath: "/folder",
  environment: "dev",
  dynamicSecret: {
    id: "dynamic-secret-id",
    name: "existing-secret",
    type: DynamicSecretProviders.Github,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    defaultTTL: "1h",
    maxTTL: "24h",
    inputs
  }
});

describe("identity and access dynamic-secret contracts", () => {
  it("sanitizes hidden AWS IAM policy branches and default username templates", () => {
    const defaults = getAwsIamCreateDefaultValues(createContext);
    const payload = getAwsIamCreatePayload(
      {
        ...defaults,
        name: "aws-secret",
        inputs: {
          method: DynamicSecretAwsIamAuth.AssumeRole,
          credentialType: DynamicSecretAwsIamCredentialType.TemporaryCredentials,
          roleArn: "arn:aws:iam::123:role/example",
          region: "us-east-1",
          policyArns: "must-clear",
          policyDocument: "must-clear",
          sessionPolicyArns: "session-policy"
        }
      },
      createContext
    );
    assert.equal(payload.usernameTemplate, undefined);
    assert.equal(payload.provider.inputs.policyArns, "");
    assert.equal(payload.provider.inputs.policyDocument, "");
    assert.equal(
      "sessionPolicyArns" in payload.provider.inputs
        ? payload.provider.inputs.sessionPolicyArns
        : undefined,
      "session-policy"
    );
  });

  it("builds one Azure Entra request per selected user", () => {
    const defaults = getAzureEntraIdCreateDefaultValues(createContext);
    const payloads = getAzureEntraIdCreatePayload(
      {
        ...defaults,
        name: "entra",
        inputs: { tenantId: "tenant", applicationId: "app", clientSecret: "masked" },
        selectedUsers: [
          { id: "1", name: "alice", email: "alice@example.com" },
          { id: "2", name: "bob", email: "bob@example.com" }
        ]
      },
      createContext
    );
    assert.deepEqual(
      payloads.map(({ name }) => name),
      ["entra-alice", "entra-bob"]
    );
    assert.equal(payloads[0]?.provider.inputs.clientSecret, "masked");
  });

  it("keeps GCP TTL limits and deduplicates token scopes", () => {
    const defaults = getGcpIamCreateDefaultValues(createContext);
    assert.equal(
      gcpIamCreateFormSchema.safeParse({
        ...defaults,
        name: "gcp",
        inputs: { serviceAccountEmail: "service@example.com", tokenScopes: [{ value: "scope" }] },
        defaultTTL: "2h"
      }).success,
      false
    );
    const payload = getGcpIamCreatePayload(
      {
        ...defaults,
        name: "gcp",
        inputs: {
          serviceAccountEmail: "service@example.com",
          tokenScopes: [{ value: "scope" }, { value: "scope" }]
        }
      },
      createContext
    );
    assert.deepEqual(payload.provider.inputs.tokenScopes, ["scope"]);
  });

  it("fixes GitHub TTL and passes masked edit credentials through unchanged", () => {
    const defaults = getGithubCreateDefaultValues(createContext);
    const privateKey = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";
    const payload = getGithubCreatePayload(
      { ...defaults, name: "github", inputs: { appId: 1, installationId: 2, privateKey } },
      createContext
    );
    assert.equal(payload.defaultTTL, "1h");
    assert.equal(payload.maxTTL, undefined);
    const edit = getGithubEditDefaultValues(
      editContext({ appId: 1, installationId: 2, privateKey: "********" })
    );
    assert.equal(edit.inputs.privateKey, "********");
  });

  it("maps LDAP Vault roles without inventing a bind password", () => {
    const defaults = getLdapCreateDefaultValues(createContext);
    assert.equal(defaults.inputs.credentialType, LdapCredentialType.Dynamic);
    const imported = getLdapVaultImportValues({
      name: "ldap-role",
      config: { url: "ldaps://ldap.example.com", binddn: "cn=admin", certificate: "ca" },
      creation_ldif: "create",
      deletion_ldif: "delete",
      default_ttl: 3600,
      max_ttl: 7200
    } as never);
    assert.equal(imported.inputs?.bindpass, "");
    assert.equal(imported.defaultTTL, "3600s");
  });

  it("requires SSH principals and preserves their payload order", () => {
    const defaults = getSshCreateDefaultValues(createContext);
    assert.equal(sshCreateFormSchema.safeParse({ ...defaults, name: "ssh" }).success, false);
    const payload = getSshCreatePayload(
      { ...defaults, name: "ssh", inputs: { ...defaults.inputs, principals: ["deploy", "root"] } },
      createContext
    );
    assert.deepEqual(payload.provider.inputs.principals, ["deploy", "root"]);
  });

  it("enforces Tailscale OAuth tags and converts CSV values", () => {
    const defaults = getTailscaleCreateDefaultValues(createContext);
    const values = {
      ...defaults,
      name: "tailscale",
      inputs: {
        authType: TailscaleKeyAuthType.AuthKeys,
        auth: { method: TailscaleAuthMethod.OAuth, clientId: "client", clientSecret: "secret" },
        tailnet: "-",
        tags: "tag:ci, tag:prod",
        reusable: true,
        preauthorized: false
      }
    } as const;
    assert.equal(
      tailscaleCreateFormSchema.safeParse({ ...values, inputs: { ...values.inputs, tags: "" } })
        .success,
      false
    );
    const payload = getTailscaleCreatePayload(values, createContext);
    assert.deepEqual(payload.provider.inputs.tags, ["tag:ci", "tag:prod"]);
  });
});
