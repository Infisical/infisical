import { describe, expect, test } from "vitest";

import { SecretSyncError } from "../secret-sync-errors";
import {
  assertUniqueAzureKeyVaultSecretNames,
  findInfisicalSecretKeyForAzureKeyVaultName,
  infisicalImportKeyFromAzureKeyVaultName,
  resolveAzureKeyVaultImportedSecretKey,
  toAzureKeyVaultSecretName
} from "./azure-key-vault-secret-name";

describe("Azure Key Vault secret names", () => {
  test("keeps hyphenated vault names on import", () => {
    expect(resolveAzureKeyVaultImportedSecretKey("user-password", {})).toBe("user-password");
    expect(resolveAzureKeyVaultImportedSecretKey("db-connection-string", {})).toBe("db-connection-string");
    expect(resolveAzureKeyVaultImportedSecretKey("api-key", {})).toBe("api-key");
  });

  test("keeps vault names that have no hyphen", () => {
    expect(resolveAzureKeyVaultImportedSecretKey("dbpassword", {})).toBe("dbpassword");
    expect(resolveAzureKeyVaultImportedSecretKey("API", {})).toBe("API");
  });

  test("updates an existing underscored secret instead of importing a second name", () => {
    const existing = { user_password: { value: "old" }, other: { value: "x" } };

    expect(resolveAzureKeyVaultImportedSecretKey("user-password", existing)).toBe("user_password");
    expect(resolveAzureKeyVaultImportedSecretKey("db-connection-string", existing)).toBe("db-connection-string");
  });

  test("prefers the hyphenated Infisical name when both forms already exist", () => {
    const existing = {
      user_password: { value: "legacy" },
      "user-password": { value: "current" }
    };

    expect(resolveAzureKeyVaultImportedSecretKey("user-password", existing)).toBe("user-password");
    expect(findInfisicalSecretKeyForAzureKeyVaultName("user-password", existing)).toBe("user-password");
  });

  test("keeps hyphens in the secret name when a key schema used underscores", () => {
    const schema = "{{environment}}_{{secretKey}}";
    const importKey = infisicalImportKeyFromAzureKeyVaultName("dev-user-password", "dev", schema);

    expect(importKey).toBe("dev_user-password");
    expect(importKey.slice("dev_".length)).toBe("user-password");

    const connectionString = infisicalImportKeyFromAzureKeyVaultName("dev-db-connection-string", "dev", schema);
    expect(connectionString.slice("dev_".length)).toBe("db-connection-string");
  });

  test("keeps a hyphenated name when the key schema already uses hyphens", () => {
    const importKey = infisicalImportKeyFromAzureKeyVaultName(
      "dev-user-password",
      "dev",
      "{{environment}}-{{secretKey}}"
    );

    expect(importKey.slice("dev-".length)).toBe("user-password");
  });

  test("puts a trailing key-schema separator back without rewriting the secret name", () => {
    const importKey = infisicalImportKeyFromAzureKeyVaultName(
      "user-password-prod",
      "prod",
      "{{secretKey}}_{{environment}}"
    );

    expect(importKey).toBe("user-password_prod");
    expect(importKey.slice(0, -"_prod".length)).toBe("user-password");
  });

  test("leaves a vault name unchanged when it does not match the key schema", () => {
    expect(infisicalImportKeyFromAzureKeyVaultName("user-password", "dev", "{{environment}}_{{secretKey}}")).toBe(
      "user-password"
    );
  });

  test("fails the sync when distinct Infisical keys normalize to the same Azure Key Vault name", () => {
    const secretMap = {
      foo_bar: { value: "from-underscore" },
      "foo-bar": { value: "from-hyphen" }
    };

    const sync = () => assertUniqueAzureKeyVaultSecretNames(Object.keys(secretMap));

    expect(sync).toThrow(SecretSyncError);

    let caught: SecretSyncError | undefined;
    try {
      sync();
    } catch (error) {
      caught = error as SecretSyncError;
    }

    expect(caught?.shouldRetry).toBe(false);
    expect(caught?.message).toContain("'foo_bar' and 'foo-bar' both become 'foo-bar'");
  });

  test("names every Infisical key in a collision, and every colliding vault name", () => {
    const sync = () => assertUniqueAzureKeyVaultSecretNames(["a_b", "a-b", "foo_bar", "foo-bar", "foo_bar_baz"]);

    expect(sync).toThrow(SecretSyncError);

    let caught: SecretSyncError | undefined;
    try {
      sync();
    } catch (error) {
      caught = error as SecretSyncError;
    }

    expect(caught?.message).toContain("'a_b' and 'a-b' both become 'a-b'");
    expect(caught?.message).toContain("'foo_bar' and 'foo-bar' both become 'foo-bar'");
    expect(caught?.message).not.toContain("foo_bar_baz");
  });

  test("allows Infisical keys that stay distinct in Azure Key Vault", () => {
    expect(() => assertUniqueAzureKeyVaultSecretNames(["foo_bar", "foo_baz", "other-name"])).not.toThrow();
  });

  test("converts underscores to hyphens only when writing to Azure Key Vault", () => {
    expect(toAzureKeyVaultSecretName("user_password")).toBe("user-password");
    expect(toAzureKeyVaultSecretName("user-password")).toBe("user-password");
    expect(toAzureKeyVaultSecretName("user_pass-word")).toBe("user-pass-word");
    expect(toAzureKeyVaultSecretName("DB_CONNECTION_STRING")).toBe("DB-CONNECTION-STRING");
  });

  test("treats a hyphenated vault secret as owned by either Infisical form", () => {
    expect(findInfisicalSecretKeyForAzureKeyVaultName("user-password", { "user-password": { value: "a" } })).toBe(
      "user-password"
    );
    expect(findInfisicalSecretKeyForAzureKeyVaultName("user-password", { user_password: { value: "a" } })).toBe(
      "user_password"
    );
    expect(findInfisicalSecretKeyForAzureKeyVaultName("user-pass-word", { "user_pass-word": { value: "a" } })).toBe(
      "user_pass-word"
    );
    expect(findInfisicalSecretKeyForAzureKeyVaultName("user-password", { other_secret: { value: "a" } })).toBe(
      undefined
    );
  });
});
