import { randomBytes, randomUUID } from "node:crypto";

import {
  KMS_ROOT_CONFIG_UUID,
  RootKeyConfig,
  RootKeyEncryptionStrategy,
  TRootKeyConfigRecord
} from "./root-key-config";
import { RootKeyRing } from "./root-key-ring";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2030-06-01T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

const record = (overrides: Partial<TRootKeyConfigRecord> = {}): TRootKeyConfigRecord => ({
  id: randomUUID(),
  encryptedRootKey: randomBytes(60),
  encryptionStrategy: RootKeyEncryptionStrategy.Software,
  kekLabel: "label",
  createdAt: daysAgo(100),
  updatedAt: daysAgo(100),
  ...overrides
});

const active = (overrides: Partial<TRootKeyConfigRecord> = {}) =>
  RootKeyConfig.restore(record({ id: KMS_ROOT_CONFIG_UUID, activatedAt: daysAgo(90), ...overrides }));
const staged = (overrides: Partial<TRootKeyConfigRecord> = {}) =>
  RootKeyConfig.restore(record({ activatedAt: null, ...overrides }));
const retained = (supersededDaysAgo: number, overrides: Partial<TRootKeyConfigRecord> = {}) =>
  RootKeyConfig.restore(record({ activatedAt: daysAgo(90), supersededAt: daysAgo(supersededDaysAgo), ...overrides }));

describe("RootKeyRing.resolutionOrder", () => {
  test("should try the active row first, then staged rows, then retained rows", () => {
    // Setup
    const old = retained(10);
    const next = staged();
    const current = active();
    const ring = RootKeyRing.of([old, next, current]);

    // Action
    const order = ring.resolutionOrder().map((config) => config.id);

    // Assert
    expect(order).toEqual([current.id, next.id, old.id]);
  });
});

describe("RootKeyRing accessors", () => {
  test("should find the active, staged and newest retained rows", () => {
    // Setup
    const current = active();
    const next = staged();
    const older = retained(20);
    const newer = retained(5);
    const ring = RootKeyRing.of([older, current, newer, next]);

    // Action
    const found = [ring.active?.id, ring.staged?.id, ring.retained?.id];

    // Assert
    expect(found).toEqual([current.id, next.id, newer.id]);
    expect(ring.retainedNewestFirst().map((config) => config.id)).toEqual([newer.id, older.id]);
  });

  test("should answer null for a missing active row and throw when it is required", () => {
    // Setup
    const ring = RootKeyRing.of([]);

    // Action
    const result = () => ring.requireActive();

    // Assert
    expect([ring.isEmpty, ring.active, ring.staged, ring.retained]).toEqual([true, null, null, null]);
    expect(result).toThrow("KMS root config not found");
  });
});

describe("RootKeyRing.assertNoRotationInProgress", () => {
  test("should accept a ring with only the active row", () => {
    // Setup
    const ring = RootKeyRing.of([active()]);

    // Action
    const result = () => ring.assertNoRotationInProgress();

    // Assert
    expect(result).not.toThrow();
  });

  test("should refuse while a key is staged or retained", () => {
    // Setup
    const withStaged = RootKeyRing.of([active(), staged()]);
    const withRetained = RootKeyRing.of([active(), retained(3)]);

    // Action
    const results = [() => withStaged.assertNoRotationInProgress(), () => withRetained.assertNoRotationInProgress()];

    // Assert
    results.forEach((result) =>
      expect(result).toThrow("An encryption key rotation is still in progress. Complete or discard it")
    );
  });
});

describe("RootKeyRing.assertCanStage", () => {
  test("should accept a software instance with nothing staged", () => {
    // Setup
    const ring = RootKeyRing.of([active(), retained(3)]);

    // Action
    const result = () => ring.assertCanStage(false);

    // Assert
    expect(result).not.toThrow();
  });

  test("should refuse an HSM instance", () => {
    // Setup
    const ring = RootKeyRing.of([active({ encryptionStrategy: RootKeyEncryptionStrategy.HSM })]);

    // Action
    const result = () => ring.assertCanStage(true);

    // Assert
    expect(result).toThrow("This instance wraps its root key with an HSM");
  });

  test("should refuse when a key is staged unless the caller asks to replace it", () => {
    // Setup
    const ring = RootKeyRing.of([active(), staged()]);

    // Action
    const results = [() => ring.assertCanStage(false), () => ring.assertCanStage(true)];

    // Assert
    expect(results[0]).toThrow("A key is already staged. Deploy that key, discard it");
    expect(results[1]).not.toThrow();
  });

  test("should refuse a ring without an active row", () => {
    // Setup
    const ring = RootKeyRing.of([staged()]);

    // Action
    const result = () => ring.assertCanStage(true);

    // Assert
    expect(result).toThrow("KMS root config not found");
  });
});

describe("RootKeyRing.assertStagedNotApplied", () => {
  test("should refuse when the staged key seen earlier is gone", () => {
    // Setup
    const earlier = RootKeyRing.of([active(), staged()]);
    const now = RootKeyRing.of([active(), retained(0)]);

    // Action
    const result = () => now.assertStagedNotApplied(earlier);

    // Assert
    expect(result).toThrow("The staged key was applied by a running instance while this request was in flight");
  });

  test("should accept when the staged key is still there or none was seen", () => {
    // Setup
    const withStaged = RootKeyRing.of([active(), staged()]);
    const without = RootKeyRing.of([active()]);

    // Action
    const results = [
      () => withStaged.assertStagedNotApplied(withStaged),
      () => without.assertStagedNotApplied(without)
    ];

    // Assert
    results.forEach((result) => expect(result).not.toThrow());
  });
});

describe("RootKeyRing.status", () => {
  test("should report the active key, the staged key and when the previous key expires", () => {
    // Setup
    const current = active({ kekLabel: "current" });
    const next = staged({ kekLabel: "next", createdAt: daysAgo(2) });
    const previous = retained(10, { kekLabel: "previous" });
    const ring = RootKeyRing.of([current, next, previous]);

    // Action
    const status = ring.status(30, "env-label");

    // Assert
    expect(status).toEqual({
      encryptionStrategy: RootKeyEncryptionStrategy.Software,
      active: { label: "current", activatedAt: daysAgo(90) },
      staged: { label: "next", createdAt: daysAgo(2) },
      expiring: {
        label: "previous",
        supersededAt: daysAgo(10),
        lastResolvedAt: null,
        expiresAt: new Date(daysAgo(10).getTime() + 30 * DAY_MS)
      }
    });
  });

  test("should fall back to the running label for an active row without one, and report no staged or expiring key", () => {
    // Setup
    const ring = RootKeyRing.of([active({ kekLabel: null })]);

    // Action
    const status = ring.status(30, "env-label");

    // Assert
    expect(status.active.label).toBe("env-label");
    expect([status.staged, status.expiring]).toEqual([null, null]);
  });

  test("should fall back to createdAt for an active row that was never activated", () => {
    // Setup
    const ring = RootKeyRing.of([active({ activatedAt: null, createdAt: daysAgo(7) })]);

    // Action
    const status = ring.status(30, null);

    // Assert
    expect(status.active.activatedAt).toEqual(daysAgo(7));
  });
});
