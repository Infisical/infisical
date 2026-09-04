import { createMongoAbility } from "@casl/ability";
import { beforeAll, describe, expect, test, vi } from "vitest";

import {
  ResourcePermissionPamResourceActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { crypto } from "@app/lib/crypto/cryptography";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { PamAccountType, PamHeartbeatStatus, PamSshAuthMethod } from "../pam/pam-enums";
import { PAM_ROTATION_FACTORY_MAP, TPamRotationHandler } from "../pam-account-rotation/pam-rotation-handlers";
import { pamAccountHeartbeatServiceFactory } from "./pam-account-heartbeat-service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const gatewayTestConnection = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock("@app/ee/services/gateway-v2/gateway-v2-fns", () => ({
  testConnectionWithGateway: (...args: unknown[]) => gatewayTestConnection(...args)
}));

const blobOf = (data: Record<string, unknown>) => Buffer.from(JSON.stringify(data));

const buildWindowsAccount = (overrides: Record<string, unknown> = {}) => ({
  id: "acc-win",
  projectId: "proj-1",
  folderId: null,
  accountType: PamAccountType.Windows,
  credentialConfigured: true,
  rotationAccountId: null,
  encryptedCredentials: blobOf({ username: "svc_app", password: "pw" }),
  encryptedConnectionDetails: blobOf({ host: "win.corp.local", port: 5985 }),
  encryptedInternalMetadata: null,
  templateSettings: { heartbeat: { enabled: true, intervalSeconds: 3600 } },
  templateName: "Windows Prod",
  templateGatewayId: "gw-1",
  templateGatewayPoolId: null,
  gatewayId: null,
  gatewayPoolId: null,
  ...overrides
});

const buildService = (
  account: Record<string, unknown>,
  opts: { testCredential?: TPamRotationHandler["testCredential"]; rotator?: Record<string, unknown> } = {}
) => {
  const updateById = vi.fn(async () => undefined);
  const testCredential = opts.testCredential ?? vi.fn(async () => true);
  const handler = { validateTarget: vi.fn(), applyPasswordChange: vi.fn(), testCredential } as TPamRotationHandler;
  const rotationHandlers = {
    [PamAccountType.Postgres]: handler,
    [PamAccountType.MySQL]: handler,
    [PamAccountType.MsSQL]: handler,
    [PamAccountType.Windows]: handler,
    [PamAccountType.WindowsAd]: handler
  } as typeof PAM_ROTATION_FACTORY_MAP;

  const identityCipher = {
    encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
    decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
  };

  const deps = {
    pamAccountDAL: {
      findByIdWithDetails: vi.fn(async (id: string) =>
        opts.rotator && id === opts.rotator.id ? opts.rotator : account
      ),
      updateById
    },
    gatewayService: { fnGetGatewayClientTlsByGatewayId: vi.fn() },
    gatewayV2Service: { getPlatformConnectionDetailsByGatewayId: vi.fn() },
    gatewayPoolService: { resolveEffectiveGatewayId: vi.fn(async () => "gw-1") },
    kmsService: { createCipherPairWithDataKey: vi.fn(async () => identityCipher) },
    permissionService: { getProjectPermission: vi.fn(), getResourcePermission: vi.fn() },
    projectDAL: { findById: vi.fn(async () => ({ id: "proj-1", orgId: "org-1" })) },
    rotationHandlers
  };

  const service = pamAccountHeartbeatServiceFactory(
    deps as unknown as Parameters<typeof pamAccountHeartbeatServiceFactory>[0]
  );
  return { service, updateById, testCredential, permissionService: deps.permissionService };
};

describe("heartbeat: Windows", () => {
  beforeAll(async () => {
    await crypto.initialize({} as never, {} as never, {} as never);
  });

  test("a Windows account is checked over WinRM, not by a reachability probe", async () => {
    const { service, testCredential, updateById } = buildService(buildWindowsAccount());

    const result = await service.checkScheduledAccount("acc-win");

    expect(testCredential).toHaveBeenCalledTimes(1);
    expect(gatewayTestConnection).not.toHaveBeenCalled();
    expect(result?.status).toBe(PamHeartbeatStatus.Healthy);
    expect(updateById).toHaveBeenCalledWith(
      "acc-win",
      expect.objectContaining({ heartbeatStatus: PamHeartbeatStatus.Healthy })
    );
  });

  test("a rejected credential stops the schedule instead of retrying into a lockout", async () => {
    const { service, updateById } = buildService(buildWindowsAccount(), {
      testCredential: vi.fn(async () => false)
    });

    const result = await service.checkScheduledAccount("acc-win");

    expect(result?.status).toBe(PamHeartbeatStatus.InvalidCredentials);
    expect(updateById).toHaveBeenCalledWith("acc-win", expect.objectContaining({ nextHeartbeatAt: null }));
  });

  test("a transport failure is never reported as a wrong password", async () => {
    const { service, updateById } = buildService(buildWindowsAccount(), {
      testCredential: vi.fn(async () => {
        throw new Error("dial tcp: i/o timeout");
      })
    });

    const result = await service.checkScheduledAccount("acc-win");

    expect(result?.status).toBe(PamHeartbeatStatus.CannotCheck);
    // Still scheduled: nothing here incremented a bad-password counter.
    expect(updateById).toHaveBeenCalledWith(
      "acc-win",
      expect.objectContaining({ heartbeatStatus: PamHeartbeatStatus.CannotCheck })
    );
    const [, update] = updateById.mock.calls[0] as unknown as [string, { nextHeartbeatAt: Date | null }];
    expect(update.nextHeartbeatAt).not.toBeNull();
  });

  test("a delegated local account validates through its rotator", async () => {
    const rotator = {
      id: "acc-rotator",
      projectId: "proj-1",
      encryptedCredentials: blobOf({ username: "admin", password: "admin-pw" })
    };
    const { service, testCredential } = buildService(buildWindowsAccount({ rotationAccountId: "acc-rotator" }), {
      rotator
    });

    await service.checkScheduledAccount("acc-win");

    expect(testCredential).toHaveBeenCalledWith(
      expect.objectContaining({ verifyVia: { username: "admin", password: "admin-pw" } }),
      expect.anything()
    );
  });

  test("Windows AD binds as itself rather than through a rotator", async () => {
    const { service, testCredential } = buildService(
      buildWindowsAccount({
        id: "acc-ad",
        accountType: PamAccountType.WindowsAd,
        rotationAccountId: "acc-rotator",
        encryptedConnectionDetails: blobOf({
          domain: "corp.local",
          dcAddress: "dc1.corp.local",
          hosts: "win1.corp.local",
          port: 389,
          rdpPort: 3389,
          useLdaps: false,
          ldapRejectUnauthorized: true
        })
      })
    );

    await service.checkScheduledAccount("acc-ad");

    expect(testCredential).toHaveBeenCalledWith(expect.objectContaining({ verifyVia: undefined }), expect.anything());
  });

  test("an account with no stored password is unknown, not failing", async () => {
    const { service } = buildService(buildWindowsAccount({ encryptedCredentials: blobOf({ username: "svc_app" }) }));

    const result = await service.checkScheduledAccount("acc-win");

    expect(result?.status).toBe(PamHeartbeatStatus.Unknown);
  });
});

describe("heartbeat: SSH certificate", () => {
  beforeAll(async () => {
    await crypto.initialize({} as never, {} as never, {} as never);
  });

  test("mints a short-lived certificate and logs in with it", async () => {
    gatewayTestConnection.mockReset();
    gatewayTestConnection.mockResolvedValue({ ok: true });

    const { SshCertKeyAlgorithm, createSshKeyPair } = await import("@app/lib/ssh");
    const { publicKey, privateKey } = await createSshKeyPair(SshCertKeyAlgorithm.ED25519);

    const account = {
      id: "acc-ssh",
      projectId: "proj-1",
      folderId: null,
      accountType: PamAccountType.SSH,
      credentialConfigured: true,
      rotationAccountId: null,
      encryptedCredentials: blobOf({ authMethod: PamSshAuthMethod.Certificate, username: "ubuntu" }),
      encryptedConnectionDetails: blobOf({ host: "10.0.0.5", port: 22 }),
      encryptedInternalMetadata: blobOf({
        caPrivateKey: privateKey,
        caPublicKey: publicKey,
        caKeyAlgorithm: "ED25519"
      }),
      templateSettings: { heartbeat: { enabled: true, intervalSeconds: 3600 } },
      templateName: "SSH Prod",
      templateGatewayId: "gw-1",
      templateGatewayPoolId: null,
      gatewayId: null,
      gatewayPoolId: null
    };

    const { service } = buildService(account);
    const result = await service.checkScheduledAccount("acc-ssh");

    expect(result?.status).toBe(PamHeartbeatStatus.Healthy);
    const [, , , , request] = gatewayTestConnection.mock.calls[0];
    expect(request).toMatchObject({ mode: "ssh", authMethod: PamSshAuthMethod.Certificate, username: "ubuntu" });
    expect((request as { certificate?: string }).certificate).toBeTruthy();
  });
});

describe("heartbeat: manual check permissions", () => {
  const actor = {
    actorId: "user-1",
    actor: ActorType.USER,
    actorOrgId: "org-1",
    actorAuthMethod: AuthMethod.EMAIL
  } as Parameters<ReturnType<typeof pamAccountHeartbeatServiceFactory>["checkAccount"]>[1];

  const abilityFor = (actions: ResourcePermissionPamResourceActions[]) =>
    createMongoAbility(actions.map((action) => ({ action, subject: ResourcePermissionSub.PamResource })));

  // A manual check sends the stored credential to whatever target the account currently points at, so it is
  // gated on reading the credential rather than on editing the account.
  test("an actor with ViewCredentials may run one", async () => {
    const { service, permissionService, testCredential } = buildService(buildWindowsAccount({ folderId: null }));
    permissionService.getResourcePermission.mockResolvedValue({
      permission: abilityFor([ResourcePermissionPamResourceActions.ViewCredentials])
    });

    await service.checkAccount({ accountId: "acc-win", projectId: "proj-1" }, actor);

    expect(testCredential).toHaveBeenCalled();
  });

  test("EditAccounts alone is refused before the target is contacted", async () => {
    const { service, permissionService, testCredential } = buildService(buildWindowsAccount({ folderId: null }));
    permissionService.getResourcePermission.mockResolvedValue({
      permission: abilityFor([
        ResourcePermissionPamResourceActions.EditAccounts,
        ResourcePermissionPamResourceActions.ReadAccounts
      ])
    });

    await expect(service.checkAccount({ accountId: "acc-win", projectId: "proj-1" }, actor)).rejects.toThrow();
    expect(testCredential).not.toHaveBeenCalled();
  });
});
