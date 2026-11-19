import { describe, expect, test, vi } from "vitest";

import { updateChefDataBagItem } from "@app/ee/services/app-connections/chef";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { preSaveTransformDestinationConfig } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";

import { ChefSyncFns } from "./chef-sync-fns";
import { TChefSyncWithCredentials } from "./chef-sync-types";

const store = vi.hoisted(() => ({ item: {} as Record<string, unknown> }));

vi.mock("@app/ee/services/app-connections/chef", () => ({
  getChefDataBagItem: vi.fn(async () => structuredClone(store.item)),
  updateChefDataBagItem: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    store.item = structuredClone(data);
  })
}));

const DATA_BAG_SECRET = "infisical-chef-sync-unit-test-secret";

// Written by `knife data bag from file --encrypt` (Chef Infra 18) with DATA_BAG_SECRET
const KNIFE_ENCRYPTED_ITEM = {
  id: "fixture",
  DB_PASSWORD: {
    encrypted_data: "S+UOc/tu3SW+2VoZsC1Fwsa7nDugB6NePfQ=\n",
    iv: "3aNOJc2v3MiO3rSv\n",
    auth_tag: "fT/TxZVEMgnAxn4SjEeLZA==\n",
    version: 3,
    cipher: "aes-256-gcm"
  },
  MULTILINE: {
    encrypted_data: "eii5OHfKbSmLDC2f2yUjkXhZ3mwEwPEOrRkqN4saAg==\n",
    iv: "KDNlEq9tYFkjWPZ5\n",
    auth_tag: "7E3g+XGIwcm8ly/P/W7scg==\n",
    version: 3,
    cipher: "aes-256-gcm"
  }
};

const makeSync = ({
  shouldEncryptSecrets,
  dataBagSecret,
  disableSecretDeletion = false
}: {
  shouldEncryptSecrets: boolean;
  dataBagSecret?: string;
  disableSecretDeletion?: boolean;
}) =>
  ({
    environment: { slug: "dev" },
    syncOptions: { disableSecretDeletion },
    destinationConfig: { dataBagName: "app", dataBagItemName: "fixture", shouldEncryptSecrets },
    connection: {
      gatewayId: null,
      gatewayPoolId: null,
      credentials: { orgName: "org", userName: "user", privateKey: "key", dataBagSecret }
    }
  }) as unknown as TChefSyncWithCredentials;

const makePayload = (secrets: Record<string, string>) =>
  ({
    flatten: () => Object.fromEntries(Object.entries(secrets).map(([key, value]) => [key, { value }]))
  }) as unknown as TSecretSyncPayload;

const gatewayV2Service = {} as never;
const gatewayPoolService = { resolveEffectiveGatewayId: async () => null } as never;

describe("ChefSyncFns encrypted data bags", () => {
  test("reads an item encrypted by knife", async () => {
    store.item = KNIFE_ENCRYPTED_ITEM;

    const secrets = await ChefSyncFns.getSecrets(
      makeSync({ shouldEncryptSecrets: false, dataBagSecret: DATA_BAG_SECRET }),
      gatewayV2Service,
      gatewayPoolService
    );

    expect(secrets).toEqual({ DB_PASSWORD: { value: "hunter2" }, MULTILINE: { value: "line1\nline2" } });
  });

  test("encrypts every value on write, including existing plain ones", async () => {
    store.item = { id: "fixture", UNMANAGED: "keep-me" };
    const secretSync = makeSync({
      shouldEncryptSecrets: true,
      dataBagSecret: DATA_BAG_SECRET,
      disableSecretDeletion: true
    });

    await ChefSyncFns.syncSecrets(secretSync, makePayload({ API_KEY: "abc123" }), gatewayV2Service, gatewayPoolService);

    expect(store.item.id).toBe("fixture");
    expect(store.item.API_KEY).toMatchObject({ version: 3, cipher: "aes-256-gcm" });
    expect(store.item.UNMANAGED).toMatchObject({ version: 3, cipher: "aes-256-gcm" });
    expect(await ChefSyncFns.getSecrets(secretSync, gatewayV2Service, gatewayPoolService)).toEqual({
      API_KEY: { value: "abc123" },
      UNMANAGED: { value: "keep-me" }
    });
  });

  test("writes plain values once encryption is turned off", async () => {
    store.item = KNIFE_ENCRYPTED_ITEM;

    await ChefSyncFns.syncSecrets(
      makeSync({ shouldEncryptSecrets: false, dataBagSecret: DATA_BAG_SECRET }),
      makePayload({ DB_PASSWORD: "hunter2", MULTILINE: "line1\nline2" }),
      gatewayV2Service,
      gatewayPoolService
    );

    expect(store.item).toEqual({ id: "fixture", DB_PASSWORD: "hunter2", MULTILINE: "line1\nline2" });
  });

  test("keeps the item encrypted when removing secrets", async () => {
    store.item = KNIFE_ENCRYPTED_ITEM;

    await ChefSyncFns.removeSecrets(
      makeSync({ shouldEncryptSecrets: true, dataBagSecret: DATA_BAG_SECRET }),
      makePayload({ MULTILINE: "line1\nline2" }),
      gatewayV2Service,
      gatewayPoolService
    );

    expect(Object.keys(store.item)).toEqual(["id", "DB_PASSWORD"]);
    expect(store.item.DB_PASSWORD).toMatchObject({ version: 3, cipher: "aes-256-gcm" });
  });

  test("fails with a clear error instead of reading or writing with a missing or wrong secret", async () => {
    store.item = KNIFE_ENCRYPTED_ITEM;

    await expect(
      ChefSyncFns.getSecrets(makeSync({ shouldEncryptSecrets: false }), gatewayV2Service, gatewayPoolService)
    ).rejects.toThrow('Chef data bag item "app/fixture" is encrypted');
    await expect(
      ChefSyncFns.getSecrets(
        makeSync({ shouldEncryptSecrets: false, dataBagSecret: "wrong-secret" }),
        gatewayV2Service,
        gatewayPoolService
      )
    ).rejects.toThrow('Couldn\'t decrypt value "DB_PASSWORD"');

    store.item = { id: "fixture", A: "1" };
    await expect(
      ChefSyncFns.syncSecrets(
        makeSync({ shouldEncryptSecrets: true }),
        makePayload({ A: "2" }),
        gatewayV2Service,
        gatewayPoolService
      )
    ).rejects.toThrow("Encryption is turned on for this sync");
    expect(store.item).toEqual({ id: "fixture", A: "1" });
  });

  test.each<[string, string | undefined, string]>([
    ["no data bag secret", undefined, 'Chef data bag item "app/fixture" is encrypted'],
    ["a wrong data bag secret", "wrong-secret", 'Couldn\'t decrypt value "DB_PASSWORD"']
  ])("doesn't write an encrypted item when the connection has %s", async (_, dataBagSecret, error) => {
    store.item = KNIFE_ENCRYPTED_ITEM;
    vi.mocked(updateChefDataBagItem).mockClear();
    const secretSync = makeSync({ shouldEncryptSecrets: true, dataBagSecret });

    await expect(
      ChefSyncFns.syncSecrets(secretSync, makePayload({ FEATURE_FLAG: "on" }), gatewayV2Service, gatewayPoolService)
    ).rejects.toThrow(error);
    await expect(
      ChefSyncFns.removeSecrets(
        secretSync,
        makePayload({ MULTILINE: "line1\nline2" }),
        gatewayV2Service,
        gatewayPoolService
      )
    ).rejects.toThrow(error);

    expect(updateChefDataBagItem).not.toHaveBeenCalled();
    expect(store.item).toEqual(KNIFE_ENCRYPTED_ITEM);
  });
});

describe("preSaveTransformDestinationConfig for Chef", () => {
  const destinationConfig = { dataBagName: "app", dataBagItemName: "fixture" };

  test("keeps the saved encryption setting when an update leaves it out", async () => {
    await expect(
      preSaveTransformDestinationConfig(
        SecretSync.Chef,
        {
          destinationConfig,
          existingDestinationConfig: { ...destinationConfig, shouldEncryptSecrets: true },
          connectionId: "c"
        },
        {} as never
      )
    ).resolves.toEqual({ ...destinationConfig, shouldEncryptSecrets: true });
  });

  test("applies an explicit change and leaves new syncs alone", async () => {
    await expect(
      preSaveTransformDestinationConfig(
        SecretSync.Chef,
        {
          destinationConfig: { ...destinationConfig, shouldEncryptSecrets: false },
          existingDestinationConfig: { ...destinationConfig, shouldEncryptSecrets: true },
          connectionId: "c"
        },
        {} as never
      )
    ).resolves.toEqual({ ...destinationConfig, shouldEncryptSecrets: false });
    await expect(
      preSaveTransformDestinationConfig(SecretSync.Chef, { destinationConfig, connectionId: "c" }, {} as never)
    ).resolves.toEqual(destinationConfig);
  });
});
