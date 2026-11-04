import { describe, expect, test, vi } from "vitest";

import { rotateSecretsFns } from "./secret-rotation-v2-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const queuedAt = new Date("2026-01-01T00:00:00Z");

const runJob = async (rotation: { isAutoRotationEnabled: boolean; lastRotatedAt: Date }) => {
  const rotateGeneratedCredentials = vi.fn(async () => ({}));
  const findById = vi.fn(async () => ({ id: "rotation-id", ...rotation }));

  await rotateSecretsFns({
    job: { id: "job-id", data: { rotationId: "rotation-id", queuedAt }, retryCount: 0, retryLimit: 5 },
    secretRotationV2DAL: { findById } as never,
    secretRotationV2Service: { rotateGeneratedCredentials } as never
  });

  return rotateGeneratedCredentials;
};

describe("rotateSecretsFns", () => {
  test("skips a queued rotation when auto-rotation was disabled after queueing", async () => {
    const rotate = await runJob({ isAutoRotationEnabled: false, lastRotatedAt: new Date("2025-12-01T00:00:00Z") });

    expect(rotate).not.toHaveBeenCalled();
  });

  test("rotates when auto-rotation is enabled and nothing rotated since queueing", async () => {
    const rotate = await runJob({ isAutoRotationEnabled: true, lastRotatedAt: new Date("2025-12-01T00:00:00Z") });

    expect(rotate).toHaveBeenCalledOnce();
  });

  test("skips when the rotation already ran after the job was queued", async () => {
    const rotate = await runJob({ isAutoRotationEnabled: true, lastRotatedAt: new Date("2026-01-02T00:00:00Z") });

    expect(rotate).not.toHaveBeenCalled();
  });
});
