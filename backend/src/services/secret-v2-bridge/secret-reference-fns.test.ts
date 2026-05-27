// Secret reference fixtures intentionally use the `${...}` syntax inside plain strings.
/* eslint-disable no-template-curly-in-string */
import { describe, expect, test } from "vitest";

import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { expandSecretReferencesFactory, getAllSecretReferences } from "./secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "./secret-v2-bridge-dal";

type MockSecret = { key: string; value: string; tags?: { slug: string }[] };
type MockFolder = { id: string; secrets: MockSecret[] };

// Builds an expander backed by an in-memory map of `${environment}:${secretPath}` -> folder.
const buildExpander = (folders: Record<string, MockFolder>) => {
  const folderDAL = {
    findBySecretPath: (projectId: string, environment: string, secretPath: string) => {
      // Normalize OS-specific separators: path.join uses "\" on win32 but "/" on the server.
      const normalizedPath = secretPath.replace(/\\/g, "/");
      const folder = folders[`${environment}:${normalizedPath}`];
      return Promise.resolve(folder ? { id: folder.id } : undefined);
    }
  } as unknown as Pick<TSecretFolderDALFactory, "findBySecretPath">;

  const secretDAL = {
    findByFolderId: ({ folderId }: { folderId: string }) => {
      const folder = Object.values(folders).find((el) => el.id === folderId);
      const secrets = (folder?.secrets ?? []).map((secret) => ({
        key: secret.key,
        encryptedValue: Buffer.from(secret.value),
        tags: secret.tags ?? [],
        userId: null
      }));
      return Promise.resolve(secrets);
    }
  } as unknown as Pick<TSecretV2BridgeDALFactory, "findByFolderId">;

  return expandSecretReferencesFactory({
    projectId: "project-1",
    decryptSecretValue: (encryptedValue) => (encryptedValue ? encryptedValue.toString() : undefined),
    secretDAL,
    folderDAL,
    canExpandValue: () => true
  });
};

describe("expandSecretReferencesFactory - secret names containing dots", () => {
  test("resolves a local secret whose name contains a dot", async () => {
    const { expandSecretReferences } = buildExpander({
      "dev:/": {
        id: "folder-dev-root",
        secrets: [
          { key: "Secret.Reference", value: "test" },
          { key: "Secret_Test", value: "${Secret.Reference}" }
        ]
      }
    });

    const result = await expandSecretReferences({
      value: "${Secret.Reference}",
      environment: "dev",
      secretPath: "/",
      secretKey: "Secret_Test"
    });

    expect(result).toBe("test");
  });

  test("still resolves cross-environment references when no local secret matches", async () => {
    const { expandSecretReferences } = buildExpander({
      "dev:/": {
        id: "folder-dev-root",
        secrets: [{ key: "APP_KEY", value: "${prod.API_KEY}" }]
      },
      "prod:/": {
        id: "folder-prod-root",
        secrets: [{ key: "API_KEY", value: "secret123" }]
      }
    });

    const result = await expandSecretReferences({
      value: "${prod.API_KEY}",
      environment: "dev",
      secretPath: "/",
      secretKey: "APP_KEY"
    });

    expect(result).toBe("secret123");
  });

  test("prefers a local dotted secret over the environment interpretation", async () => {
    // "prod.API_KEY" exists both as a local secret name and could be read as env=prod, key=API_KEY.
    // The local secret takes precedence.
    const { expandSecretReferences } = buildExpander({
      "dev:/": {
        id: "folder-dev-root",
        secrets: [
          { key: "prod.API_KEY", value: "local-wins" },
          { key: "APP_KEY", value: "${prod.API_KEY}" }
        ]
      },
      "prod:/": {
        id: "folder-prod-root",
        secrets: [{ key: "API_KEY", value: "env-value" }]
      }
    });

    const result = await expandSecretReferences({
      value: "${prod.API_KEY}",
      environment: "dev",
      secretPath: "/",
      secretKey: "APP_KEY"
    });

    expect(result).toBe("local-wins");
  });
});

describe("getAllSecretReferences - classification", () => {
  // path.join uses "\" on win32 but "/" on the server; normalize so assertions are OS-independent.
  const normalizeNested = (refs: { environment: string; secretPath: string; secretKey: string }[]) =>
    refs.map((ref) => ({ ...ref, secretPath: ref.secretPath.replace(/\\/g, "/") }));

  test("classifies non-dotted references as local and dotted references as cross-environment", () => {
    const { localReferences, nestedReferences } = getAllSecretReferences("${SIMPLE} and ${dev.folder.API_KEY}");

    expect(localReferences).toEqual(["SIMPLE"]);
    expect(normalizeNested(nestedReferences)).toEqual([
      { environment: "dev", secretPath: "/folder", secretKey: "API_KEY" }
    ]);
  });

  test("treats a dotted reference as cross-environment when no local secret keys are provided", () => {
    const { localReferences, nestedReferences } = getAllSecretReferences("${Secret.Reference}");

    expect(localReferences).toEqual([]);
    expect(normalizeNested(nestedReferences)).toEqual([
      { environment: "Secret", secretPath: "/", secretKey: "Reference" }
    ]);
  });

  test("treats a dotted reference as local when it matches a known local secret name", () => {
    const { localReferences, nestedReferences } = getAllSecretReferences("${Secret.Reference}", ["Secret.Reference"]);

    expect(localReferences).toEqual(["Secret.Reference"]);
    expect(nestedReferences).toEqual([]);
  });

  test("keeps genuine cross-environment references nested even when local keys are provided", () => {
    const { localReferences, nestedReferences } = getAllSecretReferences("${prod.API_KEY} and ${Secret.Reference}", [
      "Secret.Reference"
    ]);

    expect(localReferences).toEqual(["Secret.Reference"]);
    expect(normalizeNested(nestedReferences)).toEqual([{ environment: "prod", secretPath: "/", secretKey: "API_KEY" }]);
  });
});
