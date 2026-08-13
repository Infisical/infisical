import { describe, expect, test } from "vitest";

import { ProjectPermissionSecretActions } from "@app/ee/services/permission/project-permission";

import { calculateExposure, simulateRotation, TScoringInput } from "./secret-blast-radius-scoring";
import {
  DestinationKind,
  DestinationStatus,
  ExposureBand,
  PrincipalType,
  ReadPrecision,
  RotationVerdict,
  TBlastRadiusConsumer,
  TBlastRadiusDestination,
  TBlastRadiusPrincipal
} from "./secret-blast-radius-types";

const NOW = new Date("2026-08-12T00:00:00.000Z");

const principal = (overrides: Partial<TBlastRadiusPrincipal> = {}): TBlastRadiusPrincipal => ({
  id: "principal-1",
  name: "maya@acme.io",
  type: PrincipalType.User,
  actions: [ProjectPermissionSecretActions.ReadValue, ProjectPermissionSecretActions.DescribeSecret],
  grantPaths: [],
  observed: null,
  ...overrides
});

const destination = (overrides: Partial<TBlastRadiusDestination> = {}): TBlastRadiusDestination => ({
  id: "destination-1",
  kind: DestinationKind.Sync,
  label: "AWS Secrets Manager",
  status: DestinationStatus.Healthy,
  crossProject: false,
  autoSync: true,
  ...overrides
});

const consumer = (overrides: Partial<TBlastRadiusConsumer> = {}): TBlastRadiusConsumer => ({
  actorId: "principal-1",
  actorType: "user",
  label: "maya@acme.io",
  clients: ["cli"],
  readCount: 40,
  lastReadAt: "2026-08-11T00:00:00.000Z",
  precision: ReadPrecision.Secret,
  entitledNow: true,
  principalExists: true,
  ...overrides
});

const input = (overrides: Partial<TScoringInput> = {}): TScoringInput => ({
  principals: [],
  destinations: [],
  consumers: [],
  ghostReaders: [],
  lastValueChangedAt: new Date("2026-07-12T00:00:00.000Z"),
  isRotationManaged: false,
  rotationIntervalDays: null,
  hasApprovalPolicy: false,
  consumptionAvailable: true,
  windowDays: 30,
  now: NOW,
  ...overrides
});

describe("exposure score", () => {
  test("is unavailable, not zero, when read activity is hidden from the caller", () => {
    const exposure = calculateExposure(input({ consumptionAvailable: false, principals: [principal()] }));

    expect(exposure.score).toBeNull();
    expect(exposure.band).toBe(ExposureBand.Unavailable);
    expect(exposure.drivers[0]?.label).toContain("cannot be computed without audit log access");
  });

  test("a quiet secret with two active readers and no syncs stays low", () => {
    const exposure = calculateExposure(
      input({
        principals: [
          principal({
            id: "a",
            observed: {
              readCount: 6,
              lastReadAt: "x",
              lastReadOutsideWindow: false,
              precision: ReadPrecision.Secret,
              clients: []
            }
          }),
          principal({
            id: "b",
            observed: {
              readCount: 2,
              lastReadAt: "x",
              lastReadOutsideWindow: false,
              precision: ReadPrecision.Secret,
              clients: []
            }
          })
        ],
        lastValueChangedAt: new Date("2026-07-12T00:00:00.000Z"),
        isRotationManaged: true
      })
    );

    expect(exposure.band).toBe(ExposureBand.Low);
  });

  test("wide unused access with cross-project distribution scores high", () => {
    const exposure = calculateExposure(
      input({
        principals: Array.from({ length: 34 }, (_, index) =>
          principal({
            id: `principal-${index}`,
            observed:
              index < 6
                ? {
                    readCount: 10,
                    lastReadAt: "x",
                    lastReadOutsideWindow: false,
                    precision: ReadPrecision.Folder,
                    clients: []
                  }
                : null
          })
        ),
        destinations: [
          destination({ id: "d1" }),
          destination({ id: "d2", status: DestinationStatus.Failed }),
          destination({ id: "d3", crossProject: true, kind: DestinationKind.Import }),
          destination({ id: "d4", crossProject: true, kind: DestinationKind.Reference })
        ],
        ghostReaders: [consumer({ entitledNow: false, principalExists: false })],
        lastValueChangedAt: new Date("2025-06-24T00:00:00.000Z")
      })
    );

    expect(exposure.score).toBeGreaterThanOrEqual(60);
    expect([ExposureBand.High, ExposureBand.Critical]).toContain(exposure.band);
    expect(exposure.drivers).toHaveLength(4);
    // Every displayed contribution is a whole number, and they are ordered largest first so the header
    // reads top-down as "the reasons that matter most".
    exposure.drivers.forEach((driver) => expect(Number.isInteger(driver.points)).toBe(true));
    expect(exposure.drivers.map((driver) => driver.points)).toEqual(
      [...exposure.drivers.map((driver) => driver.points)].sort((a, b) => b - a)
    );
  });

  test("drivers name the largest contributors in plain language", () => {
    const exposure = calculateExposure(
      input({
        principals: [principal({ id: "a" }), principal({ id: "b" })],
        lastValueChangedAt: new Date("2025-06-24T00:00:00.000Z")
      })
    );

    expect(exposure.drivers.map((driver) => driver.label).join(" ")).toContain("no reads in 30d");
  });
});

describe("rotation simulation", () => {
  const secret = { key: "DATABASE_URL", environment: "prod", secretPath: "/prod/api" };

  test("a failing sync blocks rotation and names the destination", () => {
    const simulation = simulateRotation(
      input({
        destinations: [
          destination({ status: DestinationStatus.Failed, label: "Kubernetes", target: "prod/api-secrets" })
        ]
      }),
      secret
    );

    expect(simulation.verdict).toBe(RotationVerdict.Red);
    expect(simulation.headline).toBe("Not safe to rotate. 1 thing will break.");
    expect(simulation.impacts[0].code).toBe("sync-failed");
    expect(simulation.impacts[0].message).toContain("prod/api-secrets");
  });

  test("a sync that has to be pushed by hand blocks rotation", () => {
    const simulation = simulateRotation(input({ destinations: [destination({ autoSync: false })] }), secret);

    expect(simulation.impacts.map((item) => item.code)).toEqual(["sync-manual"]);
  });

  test("a consumer whose last read predates the current value is treated as caching it", () => {
    const simulation = simulateRotation(
      input({
        lastValueChangedAt: new Date("2026-08-01T00:00:00.000Z"),
        consumers: [consumer({ label: "legacy-etl", lastReadAt: "2026-06-27T00:00:00.000Z" })]
      }),
      secret
    );

    expect(simulation.verdict).toBe(RotationVerdict.Red);
    expect(simulation.impacts[0].code).toBe("consumer-stale");
    expect(simulation.impacts[0].message).toContain("caching an old value");
  });

  test("ghost readers argue for rotating, never against it", () => {
    const simulation = simulateRotation(
      input({
        ghostReaders: [
          consumer({ label: "daniel@acme.io", entitledNow: false }),
          consumer({ label: "tf-runner-old", entitledNow: false, principalExists: false })
        ]
      }),
      secret
    );

    expect(simulation.impacts).toEqual([]);
    expect(simulation.reasonsToRotate.map((item) => item.code)).toContain("ghost-readers");
    expect(simulation.reasonsToRotate[0].message).toContain("daniel@acme.io and tf-runner-old");
  });

  test("a ghost reader never appears under will-update-automatically", () => {
    const ghost = consumer({ label: "tf-runner-old", entitledNow: false, principalExists: false });
    const simulation = simulateRotation(input({ consumers: [consumer(), ghost], ghostReaders: [ghost] }), secret);

    const everyMessage = [...simulation.willUpdateAutomatically, ...simulation.worthKnowing, ...simulation.impacts]
      .map((item) => item.message)
      .join(" ");

    expect(everyMessage).not.toContain("tf-runner-old");
    expect(simulation.reasonsToRotate.map((item) => item.code)).toContain("ghost-readers");
  });

  test("both sides can be true at once: nothing breaks, and it is still overdue", () => {
    const simulation = simulateRotation(
      input({
        destinations: [destination()],
        consumers: [consumer()],
        lastValueChangedAt: new Date("2025-06-24T00:00:00.000Z"),
        ghostReaders: [consumer({ entitledNow: false })]
      }),
      secret
    );

    expect(simulation.verdict).toBe(RotationVerdict.Green);
    expect(simulation.headline).toBe("Safe to rotate. Nothing will break.");
    expect(simulation.reasonsToRotate.length).toBeGreaterThan(0);
    expect(simulation.willUpdateAutomatically.length).toBeGreaterThan(0);
  });

  test("an approval policy adds a reviewer, so it never reads as breakage", () => {
    const simulation = simulateRotation(
      input({ hasApprovalPolicy: true, approvalPolicyName: "prod-secrets", destinations: [destination()] }),
      secret
    );

    expect(simulation.impacts).toEqual([]);
    expect(simulation.verdict).toBe(RotationVerdict.Amber);
    expect(simulation.worthKnowing.map((item) => item.code)).toContain("approval-policy");
    expect(simulation.worthKnowing.find((item) => item.code === "approval-policy")?.message).toContain("prod-secrets");
  });

  test("a managed rotation says the previous credential stays valid", () => {
    const simulation = simulateRotation(
      input({ isRotationManaged: true, rotationIntervalDays: 30, destinations: [destination()] }),
      secret
    );

    expect(simulation.reasonsToRotate[0].message).toBe(
      "Managed by automatic rotation every 30 days. The previous credential stays valid until the next rotation."
    );
  });

  test("an infrequent consumer is hedged rather than asserted", () => {
    const simulation = simulateRotation(input({ consumers: [consumer({ label: "worker", readCount: 1 })] }), secret);

    expect(simulation.worthKnowing[0].message).toContain("likely fetches at startup");
  });

  test("without audit access the simulation says so instead of guessing", () => {
    const simulation = simulateRotation(
      input({ consumptionAvailable: false, consumers: [consumer()], destinations: [destination()] }),
      secret
    );

    expect(simulation.consumptionAvailable).toBe(false);
    expect(simulation.subheadline).toContain("Read activity is not visible to your role.");
    expect(simulation.impacts).toEqual([]);
  });
});
