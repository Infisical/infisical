/* eslint-disable no-template-curly-in-string */
import { expandSecretReferencesFactory } from "./secret-reference-fns";

// environment -> secret path -> key -> value
const secretStore: Record<string, Record<string, Record<string, string>>> = {
  dev: {
    "/": {
      DB_URL: "postgres://${dev.common.DB_USER}@${dev.common.DB_HOST}/app",
      DD_API_KEY_POINTER: "${dev.common.POINTER}",
      DYNAMIC_PATH: "${dev.common.${dev.common.VENDOR}.API_KEY}",
      DYNAMIC_PATH_MISSING: "${dev.common.${dev.common.UNKNOWN_VENDOR}.API_KEY}",
      DYNAMIC_KEY: "${dev.common.ENDPOINT_${dev.common.REGION}}"
    },
    "/common": {
      DB_USER: "app",
      DB_HOST: "db.internal",
      VENDOR: "datadog",
      UNKNOWN_VENDOR: "newrelic",
      REGION: "US_EAST_1",
      ENDPOINT_US_EAST_1: "us-east-1-endpoint",
      POINTER: "${dev.common.datadog.API_KEY}",
      SELF_REF: "${dev.common.SELF_REF}"
    },
    "/common/datadog": {
      API_KEY: "dd-api-key-value"
    }
  }
};

const buildExpander = () =>
  expandSecretReferencesFactory({
    projectId: "project-id",
    decryptSecretValue: (value) => value?.toString(),
    canExpandValue: () => true,
    folderDAL: {
      findBySecretPath: async (_projectId: string, environment: string, secretPath: string) =>
        secretStore[environment]?.[secretPath] ? ({ id: `${environment}:${secretPath}` } as never) : undefined
    } as never,
    secretDAL: {
      findByFolderId: async ({ folderId }: { folderId: string }) => {
        const [environment, secretPath] = folderId.split(":");
        const secrets = secretStore[environment]?.[secretPath] || {};
        return Object.entries(secrets).map(([key, value]) => ({
          key,
          encryptedValue: Buffer.from(value),
          tags: []
        })) as never;
      }
    } as never
  });

describe("expandSecretReferences", () => {
  test("expands multiple references within a single value", async () => {
    const { expandSecretReferences } = buildExpander();

    await expect(
      expandSecretReferences({
        value: secretStore.dev["/"].DB_URL,
        environment: "dev",
        secretPath: "/",
        secretKey: "DB_URL"
      })
    ).resolves.toBe("postgres://app@db.internal/app");
  });

  test("expands a chained reference whose referenced value is itself a reference", async () => {
    const { expandSecretReferences } = buildExpander();

    await expect(
      expandSecretReferences({
        value: secretStore.dev["/"].DD_API_KEY_POINTER,
        environment: "dev",
        secretPath: "/",
        secretKey: "DD_API_KEY_POINTER"
      })
    ).resolves.toBe("dd-api-key-value");
  });

  test("resolves a reference nested inside another reference's path", async () => {
    const { expandSecretReferences } = buildExpander();

    await expect(
      expandSecretReferences({
        value: secretStore.dev["/"].DYNAMIC_PATH,
        environment: "dev",
        secretPath: "/",
        secretKey: "DYNAMIC_PATH"
      })
    ).resolves.toBe("dd-api-key-value");
  });

  test("resolves a reference whose key is built from another reference", async () => {
    const { expandSecretReferences } = buildExpander();

    await expect(
      expandSecretReferences({
        value: secretStore.dev["/"].DYNAMIC_KEY,
        environment: "dev",
        secretPath: "/",
        secretKey: "DYNAMIC_KEY"
      })
    ).resolves.toBe("us-east-1-endpoint");
  });

  test("leaves a nested reference untouched when it resolves to a missing secret", async () => {
    const { expandSecretReferences } = buildExpander();

    await expect(
      expandSecretReferences({
        value: secretStore.dev["/"].DYNAMIC_PATH_MISSING,
        environment: "dev",
        secretPath: "/",
        secretKey: "DYNAMIC_PATH_MISSING"
      })
    ).resolves.toBe("${dev.common.newrelic.API_KEY}");
  });

  test("stops expanding self-referencing values instead of looping", async () => {
    const { expandSecretReferences } = buildExpander();

    await expect(
      expandSecretReferences({
        value: secretStore.dev["/common"].SELF_REF,
        environment: "dev",
        secretPath: "/common",
        secretKey: "SELF_REF"
      })
    ).resolves.toBe("${dev.common.SELF_REF}");
  });
});
