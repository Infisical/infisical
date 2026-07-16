import { describe, expect, test, vi } from "vitest";

import { ForbiddenRequestError, NotFoundError } from "@app/lib/errors";

import { mfaRecoveryCodeServiceFactory } from "./mfa-recovery-code-service";

const USER_ID = "user-1";

const kmsService = {
  encryptWithRootKey: () => (plain: Buffer) => Buffer.from(plain),
  decryptWithRootKey: () => (cipher: Buffer) => Buffer.from(cipher)
} as never;

const encodePool = (codes: string[]) => Buffer.from(codes.join(","));

const makeService = (dalPatch: Record<string, unknown>, userDALPatch: Record<string, unknown> = {}) => {
  const mfaRecoveryCodeDAL = {
    findOne: vi.fn(),
    findOneByUserIdForUpdate: vi.fn(),
    updateById: vi.fn<(id: string, patch: { encryptedRecoveryCodes: Buffer }) => Promise<void>>(),
    upsert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
    ...dalPatch
  };
  const userDAL = { findById: vi.fn().mockResolvedValue({ isMfaEnabled: true }), ...userDALPatch };
  const service = mfaRecoveryCodeServiceFactory({
    mfaRecoveryCodeDAL: mfaRecoveryCodeDAL as never,
    userDAL: userDAL as never,
    kmsService
  });
  return { service, mfaRecoveryCodeDAL, userDAL };
};

describe("mfaRecoveryCodeService.verifyAndConsumeRecoveryCode", () => {
  test("consumes exactly the matching code and persists the rest", async () => {
    const { service, mfaRecoveryCodeDAL } = makeService({
      findOneByUserIdForUpdate: vi.fn().mockResolvedValue({
        id: "cfg-1",
        encryptedRecoveryCodes: encodePool(["11111111", "22222222", "33333333"])
      })
    });

    await service.verifyAndConsumeRecoveryCode({ userId: USER_ID, recoveryCode: "22222222" });

    expect(mfaRecoveryCodeDAL.updateById).toHaveBeenCalledTimes(1);
    const [, patch] = mfaRecoveryCodeDAL.updateById.mock.calls[0];
    expect(patch.encryptedRecoveryCodes.toString().split(",")).toEqual(["11111111", "33333333"]);
  });

  test("rejects an unknown code without mutating the pool", async () => {
    const { service, mfaRecoveryCodeDAL } = makeService({
      findOneByUserIdForUpdate: vi.fn().mockResolvedValue({
        id: "cfg-1",
        encryptedRecoveryCodes: encodePool(["11111111", "22222222"])
      })
    });

    await expect(
      service.verifyAndConsumeRecoveryCode({ userId: USER_ID, recoveryCode: "99999999" })
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
    expect(mfaRecoveryCodeDAL.updateById).not.toHaveBeenCalled();
  });

  test("throws when the user has no recovery-code pool", async () => {
    const { service } = makeService({ findOneByUserIdForUpdate: vi.fn().mockResolvedValue(null) });

    await expect(
      service.verifyAndConsumeRecoveryCode({ userId: USER_ID, recoveryCode: "11111111" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("mfaRecoveryCodeService.rotateRecoveryCodes", () => {
  test("mints a fresh 10-code pool and upserts it", async () => {
    const { service, mfaRecoveryCodeDAL } = makeService({});

    const codes = await service.rotateRecoveryCodes({ userId: USER_ID });

    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(mfaRecoveryCodeDAL.upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ userId: USER_ID })],
      "userId",
      undefined
    );
  });

  test("refuses to rotate when MFA is disabled", async () => {
    const { service, mfaRecoveryCodeDAL } = makeService(
      {},
      { findById: vi.fn().mockResolvedValue({ isMfaEnabled: false }) }
    );

    await expect(service.rotateRecoveryCodes({ userId: USER_ID })).rejects.toThrow(/MFA is not enabled/);
    expect(mfaRecoveryCodeDAL.upsert).not.toHaveBeenCalled();
  });

  test("skips the MFA-enabled check during enrollment", async () => {
    const findById = vi.fn();
    const { service } = makeService({}, { findById });

    const codes = await service.rotateRecoveryCodes({ userId: USER_ID, skipMfaEnabledCheck: true });

    expect(codes).toHaveLength(10);
    expect(findById).not.toHaveBeenCalled();
  });
});
