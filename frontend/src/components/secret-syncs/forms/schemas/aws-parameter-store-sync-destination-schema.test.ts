import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { SecretSyncInitialSyncBehavior } from "@app/hooks/api/secretSyncs/enums";

import { AwsParameterStoreSyncDestinationSchema } from "./aws-parameter-store-sync-destination-schema";

const syncOptionsSchema = AwsParameterStoreSyncDestinationSchema.shape.syncOptions;

const options = {
  initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination,
  includeAllSubFolders: true
};

describe("AWS Parameter Store sync form schema", () => {
  it("rejects a key schema containing a slash while mirroring folders, on the key schema field", () => {
    const result = syncOptionsSchema.safeParse({
      ...options,
      preserveFolderStructure: true,
      keySchema: "dev/{{secretKey}}"
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.error?.issues[0].path, ["keySchema"]);
  });

  it("accepts a key schema containing a slash when the folders are flattened", () => {
    const result = syncOptionsSchema.safeParse({ ...options, keySchema: "dev/{{secretKey}}" });

    assert.equal(result.success, true);
  });

  it("accepts a key schema without a slash while mirroring folders", () => {
    const result = syncOptionsSchema.safeParse({
      ...options,
      preserveFolderStructure: true,
      keySchema: "INFISICAL_{{secretKey}}"
    });

    assert.equal(result.success, true);
  });
});
