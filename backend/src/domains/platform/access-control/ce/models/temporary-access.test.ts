import { TemporaryAccess } from "./temporary-access";

const NOW = new Date("2026-01-01T00:00:00Z");

describe("TemporaryAccess.isActive", () => {
  test("should be active when the access is permanent", () => {
    // Setup
    const access = TemporaryAccess.restore({ isTemporary: false, temporaryAccessEndTime: new Date(0) });

    // Action
    const active = access.isActive(NOW);

    // Assert
    expect(active).toBe(true);
  });

  test("should be active until the end time of a temporary grant", () => {
    // Setup
    const access = TemporaryAccess.restore({ isTemporary: true, temporaryAccessEndTime: new Date(NOW.getTime() + 1) });

    // Action
    const active = access.isActive(NOW);

    // Assert
    expect(active).toBe(true);
  });

  test("should be inactive from the end time of a temporary grant", () => {
    // Setup
    const access = TemporaryAccess.restore({ isTemporary: true, temporaryAccessEndTime: NOW });

    // Action
    const active = access.isActive(NOW);

    // Assert
    expect(active).toBe(false);
  });

  test("should be inactive when a temporary grant has no end time", () => {
    // Setup
    const access = TemporaryAccess.restore({ isTemporary: true, temporaryAccessEndTime: null });

    // Action
    const active = access.isActive(NOW);

    // Assert
    expect(active).toBe(false);
  });

  test("should read the end time from a string, as a cache returns it", () => {
    // Setup
    const later = TemporaryAccess.restore({ isTemporary: true, temporaryAccessEndTime: "2026-01-01T00:00:01.000Z" });
    const earlier = TemporaryAccess.restore({ isTemporary: true, temporaryAccessEndTime: "2025-12-31T23:59:59.000Z" });

    // Action
    const results = [later.isActive(NOW), earlier.isActive(NOW)];

    // Assert
    expect(results).toEqual([true, false]);
  });
});
