import { describe, expect, test } from "vitest";

import { SshCertKeyAlgorithm } from "@app/lib/ssh";

import { DynamicSecretProviders, OAuthClientAuthMethod, OAuthGrantType } from "./models";
import { DYNAMIC_SECRET_SECRET_FIELDS, redactStoredInputs, restoreOmittedSecretFields } from "./redact";

const oauthStoredInputs = {
  grantType: OAuthGrantType.ClientCredentials,
  tokenUrl: "https://auth.example.com/token",
  revocationUrl: "https://auth.example.com/revoke",
  clientId: "client-id",
  clientAuth: { method: OAuthClientAuthMethod.ClientSecretPost, clientSecret: "stored-secret" },
  extraParams: []
};

describe("redactStoredInputs", () => {
  const sshStoredInputs = {
    caPrivateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nca-key-material\n-----END OPENSSH PRIVATE KEY-----",
    caPublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 ca@infisical",
    principals: ["ubuntu"],
    keyAlgorithm: SshCertKeyAlgorithm.ED25519,
    caKeyAlgorithm: SshCertKeyAlgorithm.ED25519
  };

  test("withholds the SSH CA private key and keeps the rest of the configuration", () => {
    const redacted = redactStoredInputs(DynamicSecretProviders.Ssh, sshStoredInputs);

    expect(redacted).toStrictEqual({
      caPublicKey: sshStoredInputs.caPublicKey,
      principals: sshStoredInputs.principals,
      keyAlgorithm: SshCertKeyAlgorithm.ED25519,
      caKeyAlgorithm: SshCertKeyAlgorithm.ED25519
    });
    expect(JSON.stringify(redacted)).not.toContain("ca-key-material");
  });

  test("returns inputs untouched for a provider that declares no secret fields", () => {
    const sqlStoredInputs = { host: "db.internal", username: "admin", password: "hunter2" };

    expect(redactStoredInputs(DynamicSecretProviders.SqlDatabase, sqlStoredInputs)).toStrictEqual(sqlStoredInputs);
  });

  test("tolerates stored input that is not an object", () => {
    expect(redactStoredInputs(DynamicSecretProviders.Ssh, null)).toBeNull();
    expect(redactStoredInputs(DynamicSecretProviders.Ssh, undefined)).toBeUndefined();
  });

  test("declares a secret field list for every provider", () => {
    const declared = Object.keys(DYNAMIC_SECRET_SECRET_FIELDS).sort();

    expect(declared).toStrictEqual(Object.values(DynamicSecretProviders).sort());
  });

  test("withholds a nested secret field and keeps its siblings", () => {
    const redacted = redactStoredInputs(DynamicSecretProviders.OAuth, oauthStoredInputs);

    expect(redacted).toStrictEqual({
      ...oauthStoredInputs,
      clientAuth: { method: OAuthClientAuthMethod.ClientSecretPost }
    });
    expect(JSON.stringify(redacted)).not.toContain("stored-secret");
  });
});

describe("restoreOmittedSecretFields", () => {
  test("restores a nested secret the edit left out", () => {
    const restored = restoreOmittedSecretFields(DynamicSecretProviders.OAuth, oauthStoredInputs, {
      ...oauthStoredInputs,
      clientAuth: { method: OAuthClientAuthMethod.ClientSecretBasic }
    });

    expect(restored).toStrictEqual({
      ...oauthStoredInputs,
      clientAuth: { method: OAuthClientAuthMethod.ClientSecretBasic, clientSecret: "stored-secret" }
    });
  });

  test("keeps a secret the edit supplied", () => {
    const edited = {
      ...oauthStoredInputs,
      clientAuth: { method: OAuthClientAuthMethod.ClientSecretPost, clientSecret: "rotated-secret" }
    };

    expect(restoreOmittedSecretFields(DynamicSecretProviders.OAuth, oauthStoredInputs, edited)).toStrictEqual(edited);
  });

  test("leaves inputs untouched for a provider that declares no secret fields", () => {
    const edited = { host: "db.internal" };

    expect(restoreOmittedSecretFields(DynamicSecretProviders.SqlDatabase, { password: "x" }, edited)).toBe(edited);
  });
});
