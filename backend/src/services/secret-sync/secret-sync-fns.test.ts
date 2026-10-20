import { KeyStorePrefixes } from "@app/keystore/keystore";

import { SecretSync } from "./secret-sync-enums";
import { getSharedDestinationLockKey } from "./secret-sync-fns";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

describe("getSharedDestinationLockKey", () => {
  test("locks a Cloudflare Workers sync on its Worker", () => {
    expect(
      getSharedDestinationLockKey({
        destination: SecretSync.CloudflareWorkers,
        connectionId: "conn",
        destinationConfig: { scriptId: "my-worker" }
      })
    ).toBe(KeyStorePrefixes.CloudflareWorkerSyncLock("conn", "my-worker"));
  });

  test("gives other syncs no shared lock", () => {
    expect(
      getSharedDestinationLockKey({
        destination: SecretSync.CloudflarePages,
        connectionId: "conn",
        destinationConfig: { projectName: "site", environment: "production" }
      })
    ).toBeUndefined();
  });
});
