import { randomBytes, randomUUID } from "node:crypto";

import {
  KMS_ROOT_CONFIG_UUID,
  RootKeyConfig,
  RootKeyEncryptionStrategy,
  TRootKeyConfigRecord
} from "./root-key-config";

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

const retained = (overrides: Partial<TRootKeyConfigRecord> = {}) =>
  RootKeyConfig.restore(record({ activatedAt: daysAgo(90), supersededAt: daysAgo(10), ...overrides }));

describe("RootKeyConfig.bootstrap", () => {
  test("should create the active row, with an activation time only when rotation state exists", () => {
    // Setup
    const encryptedRootKey = randomBytes(60);

    // Action
    const withState = RootKeyConfig.bootstrap({
      encryptedRootKey,
      strategy: RootKeyEncryptionStrategy.HSM,
      withRotationState: true
    });
    const withoutState = RootKeyConfig.bootstrap({
      encryptedRootKey,
      strategy: RootKeyEncryptionStrategy.Software,
      withRotationState: false
    });

    // Assert
    expect([withState.isActive, withState.strategy, Boolean(withState.activatedAt)]).toEqual([
      true,
      RootKeyEncryptionStrategy.HSM,
      true
    ]);
    expect([withoutState.id, withoutState.activatedAt]).toEqual([KMS_ROOT_CONFIG_UUID, null]);
  });
});

describe("RootKeyConfig.stage", () => {
  test("should create a software row that no pod has promoted", () => {
    // Setup
    const encryptedRootKey = randomBytes(60);

    // Action
    const staged = RootKeyConfig.stage({ encryptedRootKey, kekLabel: "next" });

    // Assert
    expect([staged.isStaged, staged.isActive, staged.strategy, staged.kekLabel]).toEqual([
      true,
      false,
      RootKeyEncryptionStrategy.Software,
      "next"
    ]);
  });
});

describe("RootKeyConfig.promote", () => {
  test("should take the staged key, strategy and label and return a retained copy of the old key", () => {
    // Setup
    const current = active({ kekLabel: "old" });
    const oldKey = current.encryptedRootKey;
    const staged = RootKeyConfig.stage({ encryptedRootKey: randomBytes(60), kekLabel: "next" });

    // Action
    const previous = current.promote(staged, "fallback", NOW);

    // Assert
    expect(current.encryptedRootKey.equals(staged.encryptedRootKey)).toBe(true);
    expect([current.kekLabel, current.activatedAt, current.supersededAt]).toEqual(["next", NOW, null]);
    expect(previous.encryptedRootKey.equals(oldKey)).toBe(true);
    expect([previous.isRetained, previous.kekLabel, previous.supersededAt]).toEqual([true, "old", NOW]);
  });

  test("should label the active row with the fallback when the staged row has none", () => {
    // Setup
    const current = active();
    const staged = RootKeyConfig.restore(record({ kekLabel: null, activatedAt: null }));

    // Action
    current.promote(staged, "fallback", NOW);

    // Assert
    expect(current.kekLabel).toBe("fallback");
  });

  test("should refuse a row that is not staged and leave the active row unchanged", () => {
    // Setup
    const current = active();
    const before = current.encryptedRootKey;

    // Action
    const result = () => current.promote(retained(), null, NOW);

    // Assert
    expect(result).toThrow("Only a staged root key config can be promoted.");
    expect(current.encryptedRootKey).toBe(before);
  });

  test("should refuse to promote into a row that is not the active one", () => {
    // Setup
    const staged = RootKeyConfig.stage({ encryptedRootKey: randomBytes(60), kekLabel: "next" });

    // Action
    const result = () => retained().promote(staged, null, NOW);

    // Assert
    expect(result).toThrow("Only the active root key config can be replaced by a staged key.");
  });
});

describe("RootKeyConfig.retainedCopy", () => {
  test("should keep the key and stamp it superseded, falling back to createdAt when it was never activated", () => {
    // Setup
    const current = RootKeyConfig.restore(record({ id: KMS_ROOT_CONFIG_UUID, activatedAt: null }));

    // Action
    const copy = current.retainedCopy(NOW);

    // Assert
    expect(copy.id).not.toBe(KMS_ROOT_CONFIG_UUID);
    expect(copy.encryptedRootKey.equals(current.encryptedRootKey)).toBe(true);
    expect([copy.activatedAt, copy.supersededAt, copy.lastResolvedAt]).toEqual([daysAgo(100), NOW, null]);
  });
});

describe("RootKeyConfig.rewrap", () => {
  test("should carry the KEK label under software and drop it under HSM", () => {
    // Setup
    const current = active({ kekLabel: "old" });
    const wrapped = randomBytes(80);

    // Action
    current.rewrap(wrapped, RootKeyEncryptionStrategy.HSM, "env-label");
    const underHsm = [current.strategy, current.kekLabel];
    current.rewrap(wrapped, RootKeyEncryptionStrategy.Software, "env-label");

    // Assert
    expect(underHsm).toEqual([RootKeyEncryptionStrategy.HSM, null]);
    expect([current.strategy, current.kekLabel]).toEqual([RootKeyEncryptionStrategy.Software, "env-label"]);
  });
});

describe("RootKeyConfig.labelWith", () => {
  test("should label a row that has none, and report that it changed", () => {
    // Setup
    const row = active({ kekLabel: null });

    // Action
    const changed = row.labelWith("derived");

    // Assert
    expect([changed, row.kekLabel]).toEqual([true, "derived"]);
  });

  test("should leave an existing label alone, and do nothing without a label", () => {
    // Setup
    const labelled = active({ kekLabel: "kept" });
    const unlabelled = active({ kekLabel: null });

    // Action
    const results = [labelled.labelWith("other"), unlabelled.labelWith(null)];

    // Assert
    expect(results).toEqual([false, false]);
    expect([labelled.kekLabel, unlabelled.kekLabel]).toEqual(["kept", null]);
  });
});

describe("RootKeyConfig.recordResolution", () => {
  test("should stamp only a retained row", () => {
    // Setup
    const old = retained();
    const current = active();

    // Action
    const results = [old.recordResolution(NOW), current.recordResolution(NOW)];

    // Assert
    expect(results).toEqual([true, false]);
    expect([old.lastResolvedAt, current.lastResolvedAt]).toEqual([NOW, null]);
  });
});

describe("RootKeyConfig.removalEligibleAt", () => {
  test("should be retention after supersede when no instance ever started on the key", () => {
    // Setup
    const row = retained({ supersededAt: daysAgo(10) });

    // Action
    const eligibleAt = row.removalEligibleAt(30);

    // Assert
    expect(eligibleAt).toEqual(new Date(daysAgo(10).getTime() + 30 * DAY_MS));
  });

  test("should restart the clock from a straggler boot", () => {
    // Setup
    const row = retained({ supersededAt: daysAgo(10), lastResolvedAt: daysAgo(2) });

    // Action
    const eligibleAt = row.removalEligibleAt(30);

    // Assert
    expect(eligibleAt).toEqual(new Date(daysAgo(2).getTime() + 30 * DAY_MS));
  });

  test("should be null for a row that was never superseded", () => {
    // Setup
    const row = active();

    // Action
    const eligibleAt = row.removalEligibleAt(30);

    // Assert
    expect(eligibleAt).toBeNull();
  });
});

describe("RootKeyConfig.isRemovalDue", () => {
  test("should be due once retention has passed and not before", () => {
    // Setup
    const row = retained({ supersededAt: daysAgo(10) });

    // Action
    const results = [row.isRemovalDue(NOW, 10), row.isRemovalDue(NOW, 11)];

    // Assert
    expect(results).toEqual([true, false]);
  });

  test("should never be due while a straggler started on the key within the retention window", () => {
    // Setup
    const row = retained({ supersededAt: daysAgo(40), lastResolvedAt: daysAgo(1) });

    // Action
    const due = row.isRemovalDue(NOW, 30);

    // Assert
    expect(due).toBe(false);
  });

  test("should not be due for a row that was never superseded", () => {
    // Setup
    const row = active();

    // Action
    const due = row.isRemovalDue(NOW, 0);

    // Assert
    expect(due).toBe(false);
  });
});

describe("RootKeyConfig.isAbandoned", () => {
  test("should treat a staged row as abandoned after 30 days", () => {
    // Setup
    const fresh = RootKeyConfig.restore(record({ activatedAt: null, createdAt: daysAgo(29) }));
    const stale = RootKeyConfig.restore(record({ activatedAt: null, createdAt: daysAgo(30) }));

    // Action
    const results = [fresh.isAbandoned(NOW), stale.isAbandoned(NOW)];

    // Assert
    expect(results).toEqual([false, true]);
  });

  test("should never treat an active or retained row as abandoned", () => {
    // Setup
    const rows = [active({ createdAt: daysAgo(400) }), retained({ createdAt: daysAgo(400) })];

    // Action
    const results = rows.map((row) => row.isAbandoned(NOW));

    // Assert
    expect(results).toEqual([false, false]);
  });
});

describe("RootKeyConfig.assertRotatable", () => {
  test("should refuse an HSM-wrapped root key", () => {
    // Setup
    const row = active({ encryptionStrategy: RootKeyEncryptionStrategy.HSM });

    // Action
    const result = () => row.assertRotatable();

    // Assert
    expect(result).toThrow("This instance wraps its root key with an HSM");
  });

  test("should accept a software-wrapped root key", () => {
    // Setup
    const row = active();

    // Action
    const result = () => row.assertRotatable();

    // Assert
    expect(result).not.toThrow();
  });
});

describe("RootKeyConfig.assertNamed", () => {
  test("should accept the label of the row", () => {
    // Setup
    const row = retained({ kekLabel: "abc" });

    // Action
    const result = () => row.assertNamed("abc");

    // Assert
    expect(result).not.toThrow();
  });

  test("should refuse another label on a staged row, naming both", () => {
    // Setup
    const row = RootKeyConfig.restore(record({ activatedAt: null, kekLabel: "abc" }));

    // Action
    const result = () => row.assertNamed("xyz");

    // Assert
    expect(result).toThrow(
      "The staged encryption key is 'abc', not 'xyz'. Someone else staged a key after you loaded this page. Re-read the current state before discarding."
    );
  });

  test("should refuse another label on a retained row, naming both", () => {
    // Setup
    const row = retained({ kekLabel: "abc" });

    // Action
    const result = () => row.assertNamed("xyz");

    // Assert
    expect(result).toThrow(
      "The previous encryption key is 'abc', not 'xyz'. Another rotation has taken effect since you loaded this page. Re-read the current state before removing it."
    );
  });

  test("should refuse to name a row that has no label", () => {
    // Setup
    const staged = RootKeyConfig.restore(record({ activatedAt: null, kekLabel: null }));
    const old = retained({ kekLabel: null });

    // Action
    const results = [() => staged.assertNamed("abc"), () => old.assertNamed("abc")];

    // Assert
    expect(results[0]).toThrow("The staged encryption key carries no label to match against");
    expect(results[1]).toThrow("The previous encryption key carries no label to match against");
  });
});

describe("RootKeyConfig.assertRemovable", () => {
  test("should accept a key no instance started on", () => {
    // Setup
    const row = retained({ lastResolvedAt: null });

    // Action
    const forced = row.assertRemovable(NOW, false);

    // Assert
    expect(forced).toBe(false);
  });

  test("should accept a key whose last boot was more than an hour ago", () => {
    // Setup
    const row = retained({ lastResolvedAt: new Date(NOW.getTime() - 61 * 60 * 1000) });

    // Action
    const forced = row.assertRemovable(NOW, false);

    // Assert
    expect(forced).toBe(false);
  });

  test("should refuse a key an instance started on within the hour, naming the time", () => {
    // Setup
    const startedAt = new Date(NOW.getTime() - 10 * 60 * 1000);
    const row = retained({ lastResolvedAt: startedAt });

    // Action
    const result = () => row.assertRemovable(NOW, false);

    // Assert
    expect(result).toThrow(`An instance started on the previous encryption key at ${startedAt.toISOString()}`);
  });

  test("should allow it when forced, and say the evidence was overridden", () => {
    // Setup
    const row = retained({ lastResolvedAt: new Date(NOW.getTime() - 10 * 60 * 1000) });

    // Action
    const forced = row.assertRemovable(NOW, true);

    // Assert
    expect(forced).toBe(true);
  });
});

describe("RootKeyConfig.assertWrittenWith", () => {
  test("should refuse a software row written with another key than this instance runs with", () => {
    // Setup
    const row = active({ kekLabel: "written" });

    // Action
    const result = () => row.assertWrittenWith("running");

    // Assert
    expect(result).toThrow(
      "This instance is running with encryption key label 'running', but the active root key was written with 'written'."
    );
  });

  test("should accept a matching label, an unlabelled row, an unknown running label and an HSM row", () => {
    // Setup
    const rows = [
      [active({ kekLabel: "same" }), "same"],
      [active({ kekLabel: null }), "running"],
      [active({ kekLabel: "written" }), null],
      [active({ kekLabel: "written", encryptionStrategy: RootKeyEncryptionStrategy.HSM }), "running"]
    ] as const;

    // Action
    const results = rows.map(
      ([row, running]) =>
        () =>
          row.assertWrittenWith(running)
    );

    // Assert
    results.forEach((result) => expect(result).not.toThrow());
  });
});

describe("RootKeyConfig.assertWrappedAs", () => {
  test("should refuse a row whose wrapped key changed since it was read", () => {
    // Setup
    const row = active();

    // Action
    const result = () => row.assertWrappedAs(randomBytes(60));

    // Assert
    expect(result).toThrow("The active root key changed while this request was in flight");
  });

  test("should accept the same wrapped key", () => {
    // Setup
    const row = active();

    // Action
    const result = () => row.assertWrappedAs(Buffer.from(row.encryptedRootKey));

    // Assert
    expect(result).not.toThrow();
  });
});

describe("RootKeyConfig.toJSON", () => {
  test("should return the record it was restored from, with the changes applied", () => {
    // Setup
    const source = record({ id: KMS_ROOT_CONFIG_UUID, kekLabel: null, activatedAt: daysAgo(5) });
    const row = RootKeyConfig.restore(source);

    // Action
    row.labelWith("derived");

    // Assert
    expect(row.toJSON()).toEqual({ ...source, kekLabel: "derived", supersededAt: null, lastResolvedAt: null });
  });
});
