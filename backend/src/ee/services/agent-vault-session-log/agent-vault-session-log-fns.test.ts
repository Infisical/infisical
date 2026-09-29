import { describe, expect, test, vi } from "vitest";

import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import {
  buildSessionLogObjectKey,
  getSessionLogEntitlement,
  resolveStorageConfig,
  TSessionLogLicenseService
} from "./agent-vault-session-log-fns";

vi.mock("@app/lib/logger", () => ({ logger: { warn: () => {} } }));

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

describe("getSessionLogEntitlement", () => {
  const licenseService = ({
    paid,
    fallback = false,
    lastKnown = null
  }: {
    paid: boolean;
    fallback?: boolean;
    lastKnown?: { paid: boolean; ageMs: number } | null;
  }) =>
    ({
      getPlan: async () => ({ agentVaultByoS3: paid }),
      isServingFallbackPlan: async () => fallback,
      getLastKnownPlan: async () =>
        lastKnown ? { plan: { agentVaultByoS3: lastKnown.paid }, fetchedAt: Date.now() - lastKnown.ageMs } : null
    }) as unknown as TSessionLogLicenseService;

  test.each([
    { why: "a paid plan", service: { paid: true }, expected: "licensed" },
    { why: "a real free plan", service: { paid: false }, expected: "unlicensed" },
    {
      why: "a fallback with a recent paid answer",
      service: { paid: false, fallback: true, lastKnown: { paid: true, ageMs: 10 * 60_000 } },
      expected: "licensed"
    },
    {
      why: "a fallback with a recent free answer",
      service: { paid: false, fallback: true, lastKnown: { paid: false, ageMs: 10 * 60_000 } },
      expected: "unlicensed"
    },
    {
      why: "a fallback whose last answer is over an hour old",
      service: { paid: false, fallback: true, lastKnown: { paid: true, ageMs: 61 * 60_000 } },
      expected: "unknown"
    },
    { why: "a fallback with no real answer on record", service: { paid: false, fallback: true }, expected: "unknown" }
  ])("reads $why as $expected", async ({ service, expected }) => {
    expect(await getSessionLogEntitlement(licenseService(service), "org-1")).toBe(expected);
  });
});
