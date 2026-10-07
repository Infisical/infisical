import { describe, expect, test, vi } from "vitest";

import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import {
  buildSessionLogFolder,
  buildSessionLogObjectKey,
  chunkIdTimeMs,
  getSessionLogEntitlement,
  parseSessionLogObjectKey,
  resolveStorageConfig,
  toRev,
  TSessionLogLicenseService
} from "./agent-vault-session-log-fns";

vi.mock("@app/lib/logger", () => ({ logger: { warn: () => {} } }));

describe("session log object names", () => {
  const projectId = "c4a1e0d2-5b7f-4c1e-9a3d-2f6b8e0c7a11";
  const sessionId = "5d2e9b41-0c3a-4f8e-b7d2-91a4c6e8f035";
  const proxyId = "e91f3c20-7d4b-4a8e-9f1c-3b5d7e2a6c48";
  const chunkId = "01a11226-9990-7a3f-8c21-4e6f9b2d1a07";
  const folder = buildSessionLogFolder({ keyPrefix: "agent-vault-1", projectId, sessionId });

  test("lays out prefix, project, session, then rev, chunk and proxy", () => {
    expect(buildSessionLogObjectKey({ folder, proxyId, chunkId })).toBe(
      `agent-vault-1/${projectId}/${sessionId}/8208694117999_${chunkId}.${proxyId}.json.enc`
    );
  });

  test("omits the prefix segment entirely when there is no prefix", () => {
    expect(buildSessionLogFolder({ keyPrefix: null, projectId, sessionId })).toBe(`${projectId}/${sessionId}/`);
  });

  test("reads the time out of the chunk id", () => {
    expect(chunkIdTimeMs(chunkId)).toBe(1791305882000);
  });

  test("a newer chunk sorts first, which is the only order S3 lists in", () => {
    expect(toRev(2_000) < toRev(1_000)).toBe(true);
    expect(toRev(1_000)).toHaveLength(13);
  });

  test("clamps a time outside what 13 digits can hold", () => {
    expect(toRev(-5)).toBe("9999999999999");
    expect(toRev(1e14)).toBe("0000000000000");
  });

  test("parses a name it built", () => {
    expect(parseSessionLogObjectKey(folder, buildSessionLogObjectKey({ folder, proxyId, chunkId }))).toEqual({
      chunkId,
      proxyId,
      sealedAt: new Date(1791305882000)
    });
  });

  test.each([
    {
      why: "another session's folder",
      key: `agent-vault-1/${projectId}/other/8208694117999_${chunkId}.${proxyId}.json.enc`
    },
    { why: "a nested folder", key: `${folder}${proxyId}/2026-09-16/${chunkId}.json.enc` },
    { why: "a rev that disagrees with the chunk id", key: `${folder}8208694117998_${chunkId}.${proxyId}.json.enc` },
    { why: "a proxy that is not a uuid", key: `${folder}8208694117999_${chunkId}.proxy-1.json.enc` },
    { why: "a file someone else put there", key: `${folder}notes.txt` }
  ])("skips $why", ({ key }) => {
    expect(parseSessionLogObjectKey(folder, key)).toBeNull();
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
