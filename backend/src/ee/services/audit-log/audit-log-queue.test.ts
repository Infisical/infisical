import { describe, expect, test, vi } from "vitest";

// Minimal mock for the queue service factory function to test the TTL guard logic
// directly, without requiring the full DI container.
describe("auditLogQueueServiceFactory", () => {
  const MS_IN_DAY = 24 * 60 * 60 * 1000;

  /**
   * Replicates the TTL computation from audit-log-queue.ts so we can assert
   * that invalid retention values are caught before producing an Invalid Date.
   */
  const computeTtl = (
    planRetentionDays: number | undefined | null,
    projectRetentionDays: number | undefined | null
  ): { ttlInDays: number | undefined | null; isValid: boolean } => {
    const ttlInDays =
      projectRetentionDays && (planRetentionDays as number) > 0 && projectRetentionDays < (planRetentionDays as number)
        ? projectRetentionDays
        : planRetentionDays;

    const isValid = !!ttlInDays && Number.isFinite(ttlInDays) && ttlInDays > 0;
    return { ttlInDays: ttlInDays as number | undefined | null, isValid };
  };

  test("valid retention days produce a finite TTL", () => {
    const { ttlInDays, isValid } = computeTtl(30, undefined);
    expect(isValid).toBe(true);
    expect(ttlInDays).toBe(30);
    const ttl = (ttlInDays as number) * MS_IN_DAY;
    const expiresAt = new Date(Date.now() + ttl);
    expect(expiresAt.toString()).not.toBe("Invalid Date");
  });

  test("project-level retention overrides plan when smaller", () => {
    const { ttlInDays, isValid } = computeTtl(90, 30);
    expect(isValid).toBe(true);
    expect(ttlInDays).toBe(30);
  });

  test("undefined plan retention is detected as invalid", () => {
    const { isValid } = computeTtl(undefined, undefined);
    expect(isValid).toBe(false);
  });

  test("null plan retention is detected as invalid", () => {
    const { isValid } = computeTtl(null, null);
    expect(isValid).toBe(false);
  });

  test("zero plan retention is detected as invalid", () => {
    const { isValid } = computeTtl(0, undefined);
    expect(isValid).toBe(false);
  });

  test("NaN plan retention is detected as invalid", () => {
    const { isValid } = computeTtl(NaN, undefined);
    expect(isValid).toBe(false);
  });

  test("negative plan retention is detected as invalid", () => {
    const { isValid } = computeTtl(-10, undefined);
    expect(isValid).toBe(false);
  });

  test("NaN date is produced without the guard", () => {
    // This test documents the original bug: without the guard, an undefined
    // retention value causes new Date(Date.now() + NaN) → Invalid Date.
    const badTtl = (undefined as unknown as number) * MS_IN_DAY;
    const badDate = new Date(Date.now() + badTtl);
    expect(badDate.toString()).toBe("Invalid Date");
  });
});
