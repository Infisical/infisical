import { describe, expect, test, vi } from "vitest";

import { ForbiddenRequestError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { secretImportServiceFactory } from "./secret-import-service";

const buildService = (projectVersion: number) => {
  const getBotKey = vi.fn().mockResolvedValue({ botKey: "bot-key", shouldUseSecretV2Bridge: projectVersion === 3 });
  const service = secretImportServiceFactory({
    projectDAL: { findById: vi.fn().mockResolvedValue({ id: "project-1", version: projectVersion }) },
    projectBotService: { getBotKey },
    permissionService: {
      getProjectPermission: vi.fn().mockRejectedValue(new ForbiddenRequestError({ message: "no access" })),
      getProjectPermissionCacheFingerprint: vi.fn().mockResolvedValue("")
    }
  } as unknown as Parameters<typeof secretImportServiceFactory>[0]);
  return { service, getBotKey };
};

describe("getRawSecretsFromImports", () => {
  test.each([1, 2, 3])("resolves no bot key for a caller it refuses (project version %i)", async (version) => {
    const { service, getBotKey } = buildService(version);

    await expect(
      service.getRawSecretsFromImports({
        projectId: "project-1",
        environment: "dev",
        path: "/",
        actor: ActorType.USER,
        actorId: "user-1",
        actorAuthMethod: null,
        actorOrgId: "other-org"
      })
    ).rejects.toThrow("no access");
    expect(getBotKey).not.toHaveBeenCalled();
  });
});
