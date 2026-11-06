import { createMongoAbility } from "@casl/ability";
import { describe, expect, test, vi } from "vitest";

import {
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { dynamicSecretServiceFactory } from "./dynamic-secret-service";
import { DynamicSecretProviders } from "./providers/models";

const dynamicSecretCfg = {
  id: "dynamic-secret-1",
  name: "db-creds",
  type: DynamicSecretProviders.SqlDatabase,
  encryptedInput: Buffer.from(JSON.stringify({ host: "db.internal", password: "stored-password" }))
};

const createService = (actions: ProjectPermissionDynamicSecretActions[]) => {
  const provider = {
    validateProviderInputs: vi.fn(async (inputs: object) => inputs),
    validateConnection: vi.fn(async () => true)
  };
  const dynamicSecretDAL = {
    findOne: vi.fn(async () => dynamicSecretCfg),
    transaction: vi.fn(async (fn: (tx: object) => Promise<unknown>) => fn({})),
    updateById: vi.fn(async () => dynamicSecretCfg)
  };

  const service = dynamicSecretServiceFactory({
    dynamicSecretDAL: dynamicSecretDAL as never,
    dynamicSecretLeaseDAL: { countLeasesForDynamicSecret: vi.fn(async () => 0) } as never,
    dynamicSecretProviders: { [DynamicSecretProviders.SqlDatabase]: provider } as never,
    dynamicSecretQueueService: {} as never,
    licenseService: { getPlan: vi.fn(async () => ({ dynamicSecret: true })) } as never,
    folderDAL: { findBySecretPath: vi.fn(async () => ({ id: "folder-1", path: "/" })) } as never,
    projectDAL: { findProjectBySlug: vi.fn(async () => ({ id: "project-1" })) } as never,
    permissionService: {
      getProjectPermission: vi.fn(async () => ({
        permission: createMongoAbility([{ action: actions, subject: ProjectPermissionSub.DynamicSecrets }])
      }))
    } as never,
    kmsService: {
      createCipherPairWithDataKey: vi.fn(async () => ({
        encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
        decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
      }))
    } as never,
    gatewayV2DAL: {} as never,
    gatewayPoolService: {} as never,
    orgDAL: {} as never,
    resourceMetadataDAL: {} as never
  });

  return { service, provider, dynamicSecretDAL };
};

const request = {
  actor: ActorType.USER,
  actorId: "user-1",
  actorOrgId: "org-1",
  actorAuthMethod: AuthMethod.EMAIL,
  projectSlug: "project",
  environmentSlug: "dev",
  path: "/",
  name: dynamicSecretCfg.name
};

describe("dynamic secret update", () => {
  test("refuses an inputs change from an actor without read access to the root credential", async () => {
    const { service, provider, dynamicSecretDAL } = createService([
      ProjectPermissionDynamicSecretActions.EditRootCredential
    ]);

    await expect(service.updateByName({ ...request, inputs: { host: "db.other.example" } as never })).rejects.toThrow(
      'Cannot execute "read-root-credential" on "dynamic-secrets"'
    );
    expect(provider.validateConnection).not.toHaveBeenCalled();
    expect(dynamicSecretDAL.updateById).not.toHaveBeenCalled();
  });

  test("lets an actor without read access to the root credential change the TTL", async () => {
    const { service, dynamicSecretDAL } = createService([ProjectPermissionDynamicSecretActions.EditRootCredential]);

    await service.updateByName({ ...request, defaultTTL: "2h" });

    expect(dynamicSecretDAL.updateById).toHaveBeenCalledWith(
      dynamicSecretCfg.id,
      expect.objectContaining({ defaultTTL: "2h" }),
      expect.anything()
    );
  });
});
