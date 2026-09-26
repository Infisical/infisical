import { describe, expect, test } from "vitest";

import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { buildSessionLogObjectKey, resolveStorageConfig } from "./agent-vault-session-log-fns";

describe("buildSessionLogObjectKey", () => {
  const base = {
    projectId: "proj-1",
    sessionId: "sess-1",
    proxyId: "proxy-1",
    startedAt: new Date("2026-09-16T10:31:04.221Z"),
    chunkId: "01a0a9c5-231d-7abc-8def-0123456789ab"
  };

  test("lays out prefix, project, session, proxy, date and chunk", () => {
    expect(buildSessionLogObjectKey({ ...base, keyPrefix: "logs" })).toBe(
      "logs/proj-1/sess-1/proxy-1/2026-09-16/01a0a9c5-231d-7abc-8def-0123456789ab.json.enc"
    );
  });

  test("omits the prefix segment entirely when there is no prefix", () => {
    expect(buildSessionLogObjectKey({ ...base, keyPrefix: null })).toBe(
      "proj-1/sess-1/proxy-1/2026-09-16/01a0a9c5-231d-7abc-8def-0123456789ab.json.enc"
    );
  });

  test("dates by UTC, so a chunk near midnight does not land in the reader's day", () => {
    const key = buildSessionLogObjectKey({ ...base, startedAt: new Date("2026-09-16T23:59:59.999Z") });
    expect(key).toContain("/2026-09-16/");
  });
});

describe("resolveStorageConfig", () => {
  const complete = {
    appConnectionId: "conn-1",
    bucket: "my-bucket",
    region: AWSRegion.US_EAST_1 as string,
    keyPrefix: "logs"
  };

  test("returns the coordinates when every required field is set", () => {
    expect(resolveStorageConfig(complete)).toEqual({
      appConnectionId: "conn-1",
      bucket: "my-bucket",
      region: AWSRegion.US_EAST_1,
      keyPrefix: "logs"
    });
  });

  test("treats a missing keyPrefix as null rather than incomplete", () => {
    expect(resolveStorageConfig({ ...complete, keyPrefix: null })?.keyPrefix).toBeNull();
  });

  test.each(["appConnectionId", "bucket", "region"] as const)("is null when %s is missing", (field) => {
    expect(resolveStorageConfig({ ...complete, [field]: null })).toBeNull();
  });
});
