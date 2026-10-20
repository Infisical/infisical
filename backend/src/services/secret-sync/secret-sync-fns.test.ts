import { KeyStorePrefixes } from "@app/keystore/keystore";

import { SecretSync } from "./secret-sync-enums";
import { getSecretSyncWriteLockKeys } from "./secret-sync-fns";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

describe("getSecretSyncWriteLockKeys", () => {
  test("locks a Cloudflare Workers sync on its Worker as well as on itself", () => {
    expect(
      getSecretSyncWriteLockKeys({
        id: "sync-a",
        destination: SecretSync.CloudflareWorkers,
        connectionId: "conn",
        destinationConfig: { scriptId: "my-worker" }
      })
    ).toEqual([
      KeyStorePrefixes.SecretSyncLock("sync-a"),
      KeyStorePrefixes.CloudflareWorkerSyncLock("conn", "my-worker")
    ]);
  });

  test("locks other syncs on themselves only", () => {
    expect(
      getSecretSyncWriteLockKeys({
        id: "sync-b",
        destination: SecretSync.CloudflarePages,
        connectionId: "conn",
        destinationConfig: { projectName: "site", environment: "production" }
      })
    ).toEqual([KeyStorePrefixes.SecretSyncLock("sync-b")]);
  });
});
