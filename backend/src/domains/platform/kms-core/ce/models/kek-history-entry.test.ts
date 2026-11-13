import { KekHistoryEntry } from "./kek-history-entry";

describe("KekHistoryEntry.create", () => {
  test("should start active: neither superseded nor retired", () => {
    // Setup
    const activatedAt = new Date("2030-01-01T00:00:00.000Z");

    // Action
    const entry = KekHistoryEntry.create({ kekLabel: "abc", activatedAt });

    // Assert
    expect(entry.toJSON()).toMatchObject({ kekLabel: "abc", activatedAt, supersededAt: null, retiredAt: null });
  });
});

describe("KekHistoryEntry.supersede and retire", () => {
  test("should record each time without touching the other", () => {
    // Setup
    const entry = KekHistoryEntry.create({ kekLabel: "abc", activatedAt: new Date("2030-01-01T00:00:00.000Z") });
    const supersededAt = new Date("2030-02-01T00:00:00.000Z");
    const retiredAt = new Date("2030-03-01T00:00:00.000Z");

    // Action
    entry.supersede(supersededAt);
    const afterSupersede = entry.toJSON();
    entry.retire(retiredAt);

    // Assert
    expect(afterSupersede).toMatchObject({ supersededAt, retiredAt: null });
    expect(entry.toJSON()).toMatchObject({ supersededAt, retiredAt });
  });
});

describe("KekHistoryEntry.restore", () => {
  test("should round trip a stored record", () => {
    // Setup
    const record = {
      id: "7c3c1d46-6c7b-4cd5-9a42-1d3a1f3e7f11",
      kekLabel: "abc",
      activatedAt: new Date("2030-01-01T00:00:00.000Z"),
      supersededAt: null,
      retiredAt: null,
      createdAt: new Date("2030-01-01T00:00:00.000Z"),
      updatedAt: new Date("2030-01-01T00:00:00.000Z")
    };

    // Action
    const entry = KekHistoryEntry.restore(record);

    // Assert
    expect(entry.toJSON()).toEqual(record);
  });
});
