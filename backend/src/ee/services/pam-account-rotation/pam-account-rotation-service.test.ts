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
  templateSettings: { rotation: { enabled: true, intervalSeconds: 3600 as number | null } },
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
    [PamAccountType.MsSQL]: handler,
    [PamAccountType.OracleDB]: handler,
    [PamAccountType.Windows]: handler,
    [PamAccountType.WindowsAd]: handler
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
    pamAccountDependencyDAL: { findByAccountId: vi.fn(async () => []), updateById: vi.fn(async () => undefined) },
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

  test("manual mode (null interval) rotates but does not schedule a next run", async () => {
    const account = {
      ...buildAccount(),
      templateSettings: { rotation: { enabled: true, intervalSeconds: null } }
    };
    const { service, updateById } = buildService((password) => password === PENDING_PASSWORD, { account });

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.rotationStatus).toBe(ROTATION_STATUS.Success);
    // markRotated must clear nextRotationAt for a manual account so the cron never re-selects it.
    expect(updateById).toHaveBeenCalledWith(
      "acc-1",
      expect.objectContaining({ rotationStatus: ROTATION_STATUS.Success, nextRotationAt: null })
    );
  });

  test("self-rotation fails with an actionable error when neither the pending nor the current credential works", async () => {
    // Definitive rejection of both (not a transport blip): a self-rotating account has no other way in, so it
    // surfaces an actionable "update the stored password" error rather than a transient defer-and-retry.
    const { service, applyPasswordChange } = buildService(() => false);

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.rotationStatus).toBe(ROTATION_STATUS.Failed);
    expect(result?.message).toContain("stored password no longer works");
    expect(result?.message).not.toContain("deferred");
    expect(applyPasswordChange).not.toHaveBeenCalled();
  });

  test("clears the stale pending credential and proceeds to rotate when the current one still works", async () => {
    // Pending fails, current (and the freshly-generated password) succeed.
    const { service, applyPasswordChange } = buildService((password) => password !== PENDING_PASSWORD);

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.rotationStatus).toBe(ROTATION_STATUS.Success);
    expect(applyPasswordChange).toHaveBeenCalledTimes(1);
  });

  test("discards a pending credential whose probe throws once the current credential proves reachability", async () => {
    // Verify throws on a wrong password just as on a transport blip, so a working current credential proves
    // reachability: the pending throw is then a real rejection and can be discarded, not deferred forever.
    const { service, applyPasswordChange, updateById } = buildService((password) => {
      if (password === PENDING_PASSWORD) throw new Error("winrm auth rejected");
      return true;
    });

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.rotationStatus).toBe(ROTATION_STATUS.Success);
    expect(applyPasswordChange).toHaveBeenCalledTimes(1);
    // The freshly-rotated credential is written and the stale pending cleared.
    expect(updateById).toHaveBeenCalledWith(
      "acc-1",
      expect.objectContaining({ encryptedPendingCredentials: null, rotationStatus: ROTATION_STATUS.Success })
    );
  });

  test("defers when the pending probe throws and the current credential can't prove reachability", async () => {
    // Both probes throw (target genuinely unreachable): can't tell a dead pending from a transient failure, so
    // defer rather than risk discarding a possibly-live pending.
    const { service, applyPasswordChange } = buildService((password) => {
      if (password === PENDING_PASSWORD || password === CURRENT_PASSWORD) throw new Error("transport error");
      return true;
    });

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.rotationStatus).toBe(ROTATION_STATUS.Failed);
    expect(result?.message).toContain("deferred");
    expect(applyPasswordChange).not.toHaveBeenCalled();
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

  test("delegated target auto-heals a drifted stored credential instead of deferring", async () => {
    // The account keeps a stored current password, but it no longer matches the target (drift), and there is a
    // stale pending. Because the rotator resets unconditionally, rotation must proceed and heal the drift, unlike
    // self-rotation which would defer.
    const account = { ...buildAccount(), rotationAccountId: "rot-1" };
    const rotator = {
      id: "rot-1",
      projectId: "proj-1",
      accountType: PamAccountType.Postgres,
      encryptedCredentials: blobOf({ username: "rotuser", password: "rot-pw" }),
      encryptedConnectionDetails: blobOf(connectionDetails),
      gatewayId: "gw-rot",
      gatewayPoolId: null,
      templateGatewayId: null,
      templateGatewayPoolId: null
    };
    // Both the pending and the stored current password are rejected; only the freshly-generated password verifies.
    const { service, applyPasswordChange, updateById } = buildService(
      (password) => password !== PENDING_PASSWORD && password !== CURRENT_PASSWORD,
      { account, rotator }
    );

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.rotationStatus).toBe(ROTATION_STATUS.Success);
    // It rotated (applied a new password) rather than deferring on the drifted current credential.
    expect(applyPasswordChange).toHaveBeenCalledTimes(1);
    expect(updateById).toHaveBeenCalledWith(
      "acc-1",
      expect.objectContaining({ encryptedPendingCredentials: null, rotationStatus: ROTATION_STATUS.Success })
    );
  });

  test("aborts a delegated rotation when target and rotator are no longer the same resource, sending no credential", async () => {
    // The target's host was changed after binding, so it no longer matches the rotator's resource.
    const account = {
      ...buildAccount(),
      rotationAccountId: "rot-1",
      encryptedConnectionDetails: blobOf({
        host: "attacker.host",
        port: 5432,
        database: "app",
        sslEnabled: false,
        sslRejectUnauthorized: false
      })
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
      gatewayId: null,
      gatewayPoolId: null,
      templateGatewayId: null,
      templateGatewayPoolId: null
    };
    const { service, applyPasswordChange, testCredential } = buildService(() => true, { account, rotator });

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.rotationStatus).toBe(ROTATION_STATUS.Failed);
    expect(result?.message).toContain("same resource");
    // Nothing may leave: no probe (testCredential) and no apply against the redirected target.
    expect(testCredential).not.toHaveBeenCalled();
    expect(applyPasswordChange).not.toHaveBeenCalled();
  });

  test("caps the generated Oracle password so the credential stays verifiable", async () => {
    const account = { ...buildAccount(), accountType: PamAccountType.OracleDB };
    const { service, applyPasswordChange } = buildService((pw) => pw === CURRENT_PASSWORD, { account });

    await service.rotateScheduledAccount("acc-1");

    expect(applyPasswordChange).toHaveBeenCalled();
    const { newPassword } = applyPasswordChange.mock.calls[0][0] as { newPassword: string };
    expect(newPassword.length).toBe(30);
  });

  test("refuses to rotate when the template's minimums cannot fit Oracle's ceiling", async () => {
    const account = {
      ...buildAccount(),
      accountType: PamAccountType.OracleDB,
      templateSettings: {
        rotation: { enabled: true, intervalSeconds: 3600 as number | null },
        passwordRequirements: {
          length: 100,
          required: { lowercase: 0, uppercase: 40, digits: 40, symbols: 20 },
          allowedSymbols: "-_.~!*"
        }
      }
    };
    const { service, applyPasswordChange } = buildService((pw) => pw === CURRENT_PASSWORD, { account });

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.rotationStatus).toBe(ROTATION_STATUS.Failed);
    expect(applyPasswordChange).not.toHaveBeenCalled();
  });

  test("caps only the length when the template's character mix still fits", async () => {
    const account = {
      ...buildAccount(),
      accountType: PamAccountType.OracleDB,
      templateSettings: {
        rotation: { enabled: true, intervalSeconds: 3600 as number | null },
        passwordRequirements: {
          length: 80,
          required: { lowercase: 5, uppercase: 5, digits: 5, symbols: 5 },
          allowedSymbols: "-_.~!*"
        }
      }
    };
    const { service, applyPasswordChange } = buildService((pw) => pw === CURRENT_PASSWORD, { account });

    await service.rotateScheduledAccount("acc-1");

    const { newPassword } = applyPasswordChange.mock.calls[0][0] as { newPassword: string };
    expect(newPassword.length).toBe(30);
    expect(newPassword).toMatch(/[a-z]/);
    expect(newPassword).toMatch(/[A-Z]/);
    expect(newPassword).toMatch(/[0-9]/);
    expect(newPassword).toMatch(/[-_.~!*]/);
  });

  test("leaves the generated password length alone for the other SQL dialects", async () => {
    const { service, applyPasswordChange } = buildService((pw) => pw === CURRENT_PASSWORD);

    await service.rotateScheduledAccount("acc-1");

    const { newPassword } = applyPasswordChange.mock.calls[0][0] as { newPassword: string };
    expect(newPassword.length).toBe(48);
  });

  const buildOracleDelegatedPair = (rotatorService: string, rotatorHost = "oracle.internal") => {
    const account = {
      ...buildAccount(),
      accountType: PamAccountType.OracleDB,
      rotationAccountId: "rot-1",
      encryptedConnectionDetails: blobOf({
        host: "oracle.internal",
        port: 1521,
        database: "PDB1",
        sslEnabled: false,
        sslRejectUnauthorized: false
      })
    };
    const rotator = {
      id: "rot-1",
      projectId: "proj-1",
      accountType: PamAccountType.OracleDB,
      encryptedCredentials: blobOf({ username: "rotuser", password: "rot-pw" }),
      encryptedConnectionDetails: blobOf({
        host: rotatorHost,
        port: 1521,
        database: rotatorService,
        sslEnabled: false,
        sslRejectUnauthorized: false
      }),
      gatewayId: null,
      gatewayPoolId: null,
      templateGatewayId: null,
      templateGatewayPoolId: null
    };
    return { account, rotator };
  };

  test("aborts an Oracle delegated rotation when the rotator reaches a different service name", async () => {
    const { account, rotator } = buildOracleDelegatedPair("PDB2");
    const { service, applyPasswordChange } = buildService(() => true, { account, rotator });

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.rotationStatus).toBe(ROTATION_STATUS.Failed);
    expect(result?.message).toContain("service name");
    expect(applyPasswordChange).not.toHaveBeenCalled();
  });

  test("treats a service name that differs only in case as the same resource", async () => {
    const { account, rotator } = buildOracleDelegatedPair("pdb1");
    const { service } = buildService((pw) => pw === CURRENT_PASSWORD, { account, rotator });

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.message ?? "").not.toContain("service name");
  });

  test("treats a host that differs only in case as the same resource", async () => {
    const { account, rotator } = buildOracleDelegatedPair("PDB1", "ORACLE.INTERNAL");
    const { service } = buildService((pw) => pw === CURRENT_PASSWORD, { account, rotator });

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.message ?? "").not.toContain("same resource");
  });

  test("allows an Oracle delegated rotation within the same service name", async () => {
    const { account, rotator } = buildOracleDelegatedPair("PDB1");
    const { service } = buildService(() => true, { account, rotator });

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.rotationStatus).not.toBe(ROTATION_STATUS.Failed);
    expect(result?.message ?? "").not.toContain("same resource");
  });

  test("keeps Postgres delegated rotation working across different databases on one server", async () => {
    const account = {
      ...buildAccount(),
      rotationAccountId: "rot-1",
      encryptedConnectionDetails: blobOf({ ...connectionDetails, database: "app" })
    };
    const rotator = {
      id: "rot-1",
      projectId: "proj-1",
      accountType: PamAccountType.Postgres,
      encryptedCredentials: blobOf({ username: "rotuser", password: "rot-pw" }),
      encryptedConnectionDetails: blobOf({ ...connectionDetails, database: "rotdb" }),
      gatewayId: null,
      gatewayPoolId: null,
      templateGatewayId: null,
      templateGatewayPoolId: null
    };
    const { service } = buildService(() => true, { account, rotator });

    const result = await service.rotateScheduledAccount("acc-1");

    expect(result?.rotationStatus).not.toBe(ROTATION_STATUS.Failed);
    expect(result?.message ?? "").not.toContain("same resource");
  });
});

describe("sqlRotationHandler.validateTarget", () => {
  test("allows an Oracle account, whose SSL settings are handled by the gateway", () => {
    const validate = PAM_ROTATION_FACTORY_MAP[PamAccountType.OracleDB].validateTarget;
    expect(() => validate({ accountType: PamAccountType.OracleDB })).not.toThrow();
  });

  test("still refuses MSSQL Windows authentication", () => {
    const validate = PAM_ROTATION_FACTORY_MAP[PamAccountType.MsSQL].validateTarget;
    expect(() => validate({ accountType: PamAccountType.MsSQL, authMethod: "ntlm" })).toThrow(/SQL Server/);
  });
});
