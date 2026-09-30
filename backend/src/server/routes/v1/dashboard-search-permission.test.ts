import { createMongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { hasSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";

import { registerDashboardRouter } from "./dashboard-router";

test.each(["/team", "/team/team"])("deep search checks the actual path for a grant on %s", async (allowedPath) => {
  const routes = new Map<string, (req: unknown) => Promise<{ secrets: { secretPath: string }[] }>>();
  const permission = createMongoAbility<ProjectPermissionSet>([
    {
      action: ProjectPermissionSecretActions.DescribeSecret,
      subject: ProjectPermissionSub.Secrets,
      conditions: { environment: "dev", secretPath: allowedPath }
    }
  ]);
  const folders = [
    { id: "team", path: "/team", environment: "dev" },
    { id: "child", path: "/team/child", environment: "dev" }
  ];
  const getSecretsRawByFolderMappings = vi.fn(
    async ({ folderMappings }: { folderMappings: { path: string; folderId: string }[] }) => ({
      secrets: folderMappings
        .filter(({ path }: { path: string }) =>
          hasSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
            environment: "dev",
            secretPath: path,
            secretName: "KEY",
            secretTags: []
          })
        )
        .map(({ path, folderId }: { path: string; folderId: string }) => ({
          id: folderId,
          secretKey: "KEY",
          secretPath: path,
          environment: "dev"
        })),
      isLimitReached: false
    })
  );
  const listDynamicSecretsByFolderIds = vi.fn().mockResolvedValue({ dynamicSecrets: [], isLimitReached: false });
  const getQuickSearchSecretRotations = vi.fn().mockResolvedValue({ secretRotations: [], isLimitReached: false });
  const server = {
    route: ({
      url,
      handler
    }: {
      url: string;
      handler: (req: unknown) => Promise<{ secrets: { secretPath: string }[] }>;
    }) => routes.set(url, handler),
    services: {
      folder: { getFoldersDeepByEnvs: vi.fn().mockResolvedValue(folders) },
      secret: { getSecretsRawByFolderMappings },
      dynamicSecret: { listDynamicSecretsByFolderIds },
      secretRotationV2: { getQuickSearchSecretRotations },
      auditLog: { createAuditLog: vi.fn() },
      telemetry: { sendPostHogEvents: vi.fn() }
    }
  } as unknown as Parameters<typeof registerDashboardRouter>[0];
  await registerDashboardRouter(server);
  const result = await routes.get("/secrets-deep-search")!({
    query: { projectId: "project", environments: "dev", secretPath: "/team", search: "KEY", limit: 25, offset: 0 },
    permission: { orgId: "org" },
    auth: { actor: "user", user: { username: "review-test" } },
    auditLogInfo: {},
    headers: {}
  });

  expect(result.secrets.map(({ secretPath }) => secretPath)).toEqual(allowedPath === "/team" ? ["/team"] : []);
  const expectedMappings = [
    { folderId: "team", path: "/team", environment: "dev" },
    { folderId: "child", path: "/team/child", environment: "dev" }
  ];
  for (const method of [getSecretsRawByFolderMappings, listDynamicSecretsByFolderIds, getQuickSearchSecretRotations]) {
    expect(method).toHaveBeenCalledWith(
      expect.objectContaining({ folderMappings: expectedMappings }),
      expect.anything()
    );
  }
});
