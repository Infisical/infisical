import { describe, expect, it } from "vitest";

import { AgentVaultSessionLogStorageType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultSessionLogSettings } from "@app/hooks/api/agentVault/types";

import {
  buildSessionLogSchema,
  needsSessionLogUpgrade,
  toStorage,
  TSessionLogFormValues
} from "./SessionLogModal.utils";

const external: TSessionLogFormValues = {
  enabled: true,
  storageType: AgentVaultSessionLogStorageType.External,
  appConnectionId: "6f1c7a52-3f7e-4c8e-9a40-0b2d6c1e9f11",
  bucket: "globex-audit",
  region: "us-east-1",
  keyPrefix: "logs"
};

const savedExternal: TAgentVaultSessionLogSettings = {
  enabled: true,
  storage: {
    type: AgentVaultSessionLogStorageType.External,
    appConnectionId: external.appConnectionId,
    bucket: external.bucket,
    region: external.region,
    keyPrefix: "logs"
  }
};

const errorPaths = (
  values: TSessionLogFormValues,
  saved = null as TAgentVaultSessionLogSettings | null
) => {
  const result = buildSessionLogSchema(saved, true).safeParse(values);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
};

describe("the session log form", () => {
  it("checks the bucket fields only for external storage that's being turned on", () => {
    const blank = { ...external, appConnectionId: "", bucket: "", keyPrefix: "/logs" };
    expect(errorPaths(blank)).toEqual(["appConnectionId", "bucket", "keyPrefix"]);
    expect(errorPaths({ ...blank, enabled: false })).toEqual([]);
    expect(errorPaths({ ...blank, storageType: AgentVaultSessionLogStorageType.Default })).toEqual(
      []
    );
  });

  it("skips the bucket fields when external storage can't be used", () => {
    const blank = { ...external, appConnectionId: "", bucket: "" };
    expect(buildSessionLogSchema(null, false).safeParse(blank).success).toBe(true);
  });

  it("refuses a new directory bucket, but keeps one that is already saved", () => {
    const directory = { ...external, bucket: "logs--usw2-az1--x-s3" };
    expect(errorPaths(directory)).toEqual(["bucket"]);
    const saved = {
      ...savedExternal,
      storage: { ...savedExternal.storage, bucket: directory.bucket }
    };
    expect(errorPaths(directory, saved as TAgentVaultSessionLogSettings)).toEqual([]);
  });

  it("refuses a key prefix longer than 256 characters", () => {
    expect(errorPaths({ ...external, keyPrefix: "a".repeat(257) })).toEqual(["keyPrefix"]);
    expect(errorPaths({ ...external, keyPrefix: "a".repeat(256) })).toEqual([]);
  });

  it("sends only the type for default storage, and trimmed fields for external", () => {
    expect(
      toStorage({ ...external, storageType: AgentVaultSessionLogStorageType.Default })
    ).toEqual({
      type: AgentVaultSessionLogStorageType.Default
    });
    expect(toStorage({ ...external, bucket: " globex-audit ", keyPrefix: " logs " })).toMatchObject(
      {
        bucket: "globex-audit",
        keyPrefix: "logs"
      }
    );
  });
});

describe("needsSessionLogUpgrade", () => {
  const notOnPlan = () => false;

  it("asks for the plan when the save would choose, change or turn on a storage", () => {
    expect(needsSessionLogUpgrade(external, null, notOnPlan)).toBe(true);
    expect(needsSessionLogUpgrade({ ...external, bucket: "other" }, savedExternal, notOnPlan)).toBe(
      true
    );
    expect(needsSessionLogUpgrade(external, { ...savedExternal, enabled: false }, notOnPlan)).toBe(
      true
    );
  });

  it("lets an unchanged save of a lapsed bucket through", () => {
    expect(needsSessionLogUpgrade(external, savedExternal, notOnPlan)).toBe(false);
  });

  it("always asks for default storage, which can be on without anyone saving it", () => {
    const defaultValues = { ...external, storageType: AgentVaultSessionLogStorageType.Default };
    const defaultOn: TAgentVaultSessionLogSettings = {
      enabled: true,
      storage: { type: AgentVaultSessionLogStorageType.Default }
    };
    expect(needsSessionLogUpgrade(defaultValues, defaultOn, notOnPlan)).toBe(true);
  });

  it("never asks when the storage is on the plan", () => {
    expect(needsSessionLogUpgrade(external, null, () => true)).toBe(false);
  });
});
