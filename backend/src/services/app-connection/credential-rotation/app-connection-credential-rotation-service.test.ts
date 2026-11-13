import { beforeEach, describe, expect, test, vi } from "vitest";

import { AppConnection } from "../app-connection-enums";
import { LdapConnectionMethod } from "../ldap/ldap-connection-enums";
import { appConnectionCredentialRotationServiceFactory } from "./app-connection-credential-rotation-service";

const issueInitialCredentials = vi.fn();

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ isRotationDevelopmentMode: false }) }));

vi.mock("./providers/ldap", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./providers/ldap")>()),
  ldapCredentialRotationProviderFactory: () => ({
    validateConnectionMethod: vi.fn(),
    issueInitialCredentials
  })
}));

const CONNECTION_ID = "conn-1";
const TX = { isTx: true, executionPromise: Promise.resolve() } as never;

const buildService = () => {
  const appConnectionDAL = {
    findById: vi.fn(async () => ({
      id: CONNECTION_ID,
      orgId: "org-1",
      projectId: null,
      app: AppConnection.LDAP,
      method: LdapConnectionMethod.SimpleBind,
      encryptedCredentials: Buffer.from(JSON.stringify({ url: "ldaps://example.com" }))
    })),
    updateById: vi.fn(),
    transaction: vi.fn()
  };
  const rotationDAL = {
    findByConnectionId: vi.fn(async () => undefined),
    create: vi.fn(async (row: Record<string, unknown>) => ({ id: "rotation-1", ...row }))
  };

  const cipher = {
    createCipherPairWithDataKey: vi.fn(async () => ({
      encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
      decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
    }))
  };
  const dataKeyService = { ...cipher, within: vi.fn(() => cipher) };

  const service = appConnectionCredentialRotationServiceFactory({
    appConnectionCredentialRotationDAL: rotationDAL,
    appConnectionDAL,
    dataKeyService,
    keyStore: {},
    queueService: {},
    gatewayV2Service: {},
    gatewayPoolService: {}
  } as unknown as Parameters<typeof appConnectionCredentialRotationServiceFactory>[0]);

  return { service, appConnectionDAL, rotationDAL, dataKeyService };
};

const DTO = { connectionId: CONNECTION_ID, rotationInterval: 30, rotateAtUtc: { hours: 0, minutes: 0 } };

describe("createRotation", () => {
  beforeEach(() => {
    issueInitialCredentials.mockReset();
  });

  test("writes nothing when the provider fails to issue credentials", async () => {
    issueInitialCredentials.mockRejectedValue(new Error("LDAP bind failed"));
    const { service, appConnectionDAL, rotationDAL } = buildService();

    await expect(service.createRotation(DTO, TX)).rejects.toThrow("LDAP bind failed");

    expect(appConnectionDAL.updateById).not.toHaveBeenCalled();
    expect(rotationDAL.create).not.toHaveBeenCalled();
  });

  test("runs KMS Core in the caller's transaction and defers revocation to the caller", async () => {
    const postCommitCallback = vi.fn();
    issueInitialCredentials.mockResolvedValue({
      strategyConfig: {},
      generatedCredentials: [],
      updatedCredentials: { url: "ldaps://example.com", password: "new" },
      postCommitCallback
    });
    const { service, appConnectionDAL, rotationDAL, dataKeyService } = buildService();

    const result = await service.createRotation(DTO, TX);

    expect(dataKeyService.within).toHaveBeenCalled();
    expect(appConnectionDAL.updateById).toHaveBeenCalledWith(CONNECTION_ID, expect.anything(), TX);
    expect(rotationDAL.create).toHaveBeenCalledWith(expect.anything(), TX);
    expect(result.postCommitCallback).toBe(postCommitCallback);
    expect(postCommitCallback).not.toHaveBeenCalled();
  });
});
