import { beforeAll, describe, expect, test, vi } from "vitest";

import { crypto } from "@app/lib/crypto/cryptography";

import { PamAccountType } from "../pam/pam-enums";
import { pamAccountRotationServiceFactory, ROTATION_STATUS } from "./pam-account-rotation-service";
import { PAM_ROTATION_FACTORY_MAP, TPamRotationHandler } from "./pam-rotation-handlers";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// The KMS cipher is faked as identity, so a "blob" is just the JSON buffer and encrypt/decrypt round-trip in-memory.
const blobOf = (data: Record<string, unknown>) => Buffer.from(JSON.stringify(data));

const connectionDetails = {
  host: "db.internal",
  port: 5432,
  database: "app",
  sslEnabled: false,
  sslRejectUnauthorized: false
};

const CURRENT_PASSWORD = "current-pw";
const PENDING_PASSWORD = "pending-pw";

// A self-rotating Postgres account with a staged pending credential, so every run enters the recovery-probe branch.
const buildAccount = () => ({
  id: "acc-1",
  projectId: "proj-1",
  accountType: PamAccountType.Postgres,
  rotationAccountId: "acc-1",
  credentialConfigured: true,
  name: "target",
  encryptedCredentials: blobOf({ username: "app", password: CURRENT_PASSWORD }),
  encryptedConnectionDetails: blobOf(connectionDetails),
  encryptedPendingCredentials: blobOf({ username: "app", password: PENDING_PASSWORD }),
  templateSettings: { rotation: { enabled: true, intervalSeconds: 3600 } },
  templateGatewayId: null,
  templateGatewayPoolId: null,
  gatewayId: null,
  gatewayPoolId: null
});

// Builds the service with a fake handler whose testCredential verdict is driven per-password by `passwordWorks`.
// A `rotator` override enables the delegated path: findById(WithDetails) resolves it by id, everything else the target.
const buildService = (
  passwordWorks: (password: string) => boolean,
  opts: { account?: ReturnType<typeof buildAccount>; rotator?: Record<string, unknown> } = {}
) => {
  const updateById = vi.fn(async () => undefined);
  const account = opts.account ?? buildAccount();
  const { rotator } = opts;
  const resolve = async (id: string) => (rotator && id === rotator.id ? rotator : account);

  const applyPasswordChange = vi.fn<(input: unknown) => Promise<void>>(async () => undefined);
  const testCredential = vi.fn(async ({ auth }: { auth: { password: string } }) => passwordWorks(auth.password));
  const handler: TPamRotationHandler = { validateTarget: vi.fn(), applyPasswordChange, testCredential };
  const rotationHandlers: typeof PAM_ROTATION_FACTORY_MAP = {
    [PamAccountType.Postgres]: handler,
    [PamAccountType.MySQL]: handler,
    [PamAccountType.MsSQL]: handler
  };

  const identityCipher = {
    encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
    decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
  };

  const deps = {
    pamAccountDAL: {
      findById: vi.fn(resolve),
      findByIdWithDetails: vi.fn(resolve),
      updateById,
      findRotationCandidates: vi.fn(),
      reconcileRotationScheduleForAccount: vi.fn(),
      transaction: vi.fn()
    },
    permissionService: { getProjectPermission: vi.fn(), getResourcePermission: vi.fn() },
    membershipDAL: { findResourceMembershipsForActor: vi.fn() },
    membershipRoleDAL: { find: vi.fn() },
    kmsService: { createCipherPairWithDataKey: vi.fn(async () => identityCipher) },
    keyStore: { acquireLock: vi.fn(async () => ({ release: vi.fn(async () => undefined) })) },
    gatewayService: { fnGetGatewayClientTlsByGatewayId: vi.fn() },
    gatewayV2Service: { getPlatformConnectionDetailsByGatewayId: vi.fn() },
    gatewayPoolService: { resolveEffectiveGatewayId: vi.fn() },
    rotationHandlers
  };

  const service = pamAccountRotationServiceFactory(
    deps as unknown as Parameters<typeof pamAccountRotationServiceFactory>[0]
  );
  return { service, updateById, applyPasswordChange, testCredential };
};

describe("rotateScheduledAccount recovery probe", () => {
  beforeAll(async () => {
    await crypto.initialize({} as never, {} as never, {} as never);
  });

  test("promotes the pending credential when it authenticates, without re-applying", async () => {
    const { service, updateById, applyPasswordChange } = buildService((password) => password === PENDING_PASSWORD);

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.rotationStatus).toBe(ROTATION_STATUS.Success);
    expect(applyPasswordChange).not.toHaveBeenCalled();
    // markRotated writes the pending blob as the live credential and clears the staged one.
    expect(updateById).toHaveBeenCalledWith(
      "acc-1",
      expect.objectContaining({
        encryptedCredentials: blobOf({ username: "app", password: PENDING_PASSWORD }),
        encryptedPendingCredentials: null,
        rotationStatus: ROTATION_STATUS.Success
      })
    );
  });

  test("defers when neither the pending nor the current credential authenticates", async () => {
    const { service, applyPasswordChange } = buildService(() => false);

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.rotationStatus).toBe(ROTATION_STATUS.Failed);
    expect(result?.message).toContain("deferred");
    expect(applyPasswordChange).not.toHaveBeenCalled();
  });

  test("clears the stale pending credential and proceeds to rotate when the current one still works", async () => {
    // Pending fails, current (and the freshly-generated password) succeed.
    const { service, applyPasswordChange } = buildService((password) => password !== PENDING_PASSWORD);

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.rotationStatus).toBe(ROTATION_STATUS.Success);
    expect(applyPasswordChange).toHaveBeenCalledTimes(1);
  });

  test("delegated target with no stored current password falls through instead of deferring, and applies over the rotator's own connection", async () => {
    // Delegated target: no stored current password, so the "neither works" defer is skipped (the rotator re-sets).
    const account = {
      ...buildAccount(),
      rotationAccountId: "rot-1",
      credentialConfigured: false,
      encryptedCredentials: blobOf({ username: "app" })
    };
    const rotator = {
      id: "rot-1",
      projectId: "proj-1",
      accountType: PamAccountType.Postgres,
      encryptedCredentials: blobOf({ username: "rotuser", password: "rot-pw" }),
      encryptedConnectionDetails: blobOf({
        host: "db.internal",
        port: 5432,
        database: "rotdb",
        sslEnabled: false,
        sslRejectUnauthorized: false
      }),
      gatewayId: "gw-rot",
      gatewayPoolId: null,
      templateGatewayId: null,
      templateGatewayPoolId: null
    };
    // Pending fails; the freshly-generated password verifies.
    const { service, applyPasswordChange } = buildService((password) => password !== PENDING_PASSWORD, {
      account,
      rotator
    });

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.rotationStatus).toBe(ROTATION_STATUS.Success);
    // The apply must run over the ROTATOR's own database and gateway, authenticating as the rotator.
    expect(applyPasswordChange).toHaveBeenCalledTimes(1);
    const applyArgs = applyPasswordChange.mock.calls[0]?.[0] as {
      connectionDetails: { database: string };
      gatewayId?: string | null;
      auth: { username: string };
      targetUsername: string;
    };
    expect(applyArgs.connectionDetails.database).toBe("rotdb");
    expect(applyArgs.gatewayId).toBe("gw-rot");
    expect(applyArgs.auth.username).toBe("rotuser");
    // ...but the target's own username is what gets altered.
    expect(applyArgs.targetUsername).toBe("app");
  });
});
