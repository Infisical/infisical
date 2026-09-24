import { vi } from "vitest";

import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";

import { secretFolderServiceFactory } from "./secret-folder-service";

const actor: OrgServiceActor = {
  type: ActorType.USER,
  id: "user-1",
  authMethod: null,
  orgId: "org-1",
  rootOrgId: "org-1",
  parentOrgId: "org-1"
};

const buildService = ({
  parents,
  relativeFolders
}: {
  parents: { id: string; path: string }[];
  relativeFolders: { id: string; path: string; depth: number; environment: string }[];
}) => {
  const folderDAL = {
    findBySecretPathMultiEnv: vi.fn().mockResolvedValue(parents),
    findByEnvsDeep: vi.fn().mockResolvedValue(relativeFolders)
  };
  const service = secretFolderServiceFactory({
    permissionService: { getProjectPermission: vi.fn().mockResolvedValue({}) },
    projectEnvDAL: { findBySlugs: vi.fn().mockResolvedValue([{ id: "env-prod", slug: "prod" }]) },
    folderDAL
  } as unknown as Parameters<typeof secretFolderServiceFactory>[0]);

  return { service, folderDAL };
};

describe("getFoldersDeepByEnvs", () => {
  test("prefixes the relative walk with the resolved secret path", async () => {
    const { service, folderDAL } = buildService({
      parents: [
        { id: "backend-prod", path: "/app/backend" },
        { id: "backend-staging", path: "/app/backend" }
      ],
      relativeFolders: [
        { id: "backend-prod", path: "/", depth: 0, environment: "prod" },
        { id: "db-prod", path: "/db", depth: 1, environment: "prod" },
        { id: "creds-prod", path: "/db/creds", depth: 2, environment: "prod" },
        { id: "db-staging", path: "/db", depth: 1, environment: "staging" }
      ]
    });

    const folders = await service.getFoldersDeepByEnvs(
      { projectId: "project-1", environments: ["prod", "staging"], secretPath: "/app/backend" },
      actor
    );

    expect(folderDAL.findByEnvsDeep).toHaveBeenCalledWith({ parentIds: ["backend-prod", "backend-staging"] });
    expect(folders.map(({ id, path, depth }) => ({ id, path, depth }))).toEqual([
      { id: "backend-prod", path: "/app/backend", depth: 0 },
      { id: "db-prod", path: "/app/backend/db", depth: 1 },
      { id: "creds-prod", path: "/app/backend/db/creds", depth: 2 },
      { id: "db-staging", path: "/app/backend/db", depth: 1 }
    ]);
  });

  test("keeps paths relative to the environment root when the search starts at /", async () => {
    const { service } = buildService({
      parents: [{ id: "root", path: "/" }],
      relativeFolders: [
        { id: "root", path: "/", depth: 0, environment: "prod" },
        { id: "db", path: "/db", depth: 1, environment: "prod" }
      ]
    });

    const folders = await service.getFoldersDeepByEnvs(
      { projectId: "project-1", environments: ["prod"], secretPath: "/" },
      actor
    );

    expect(folders.map(({ id, path }) => ({ id, path }))).toEqual([
      { id: "root", path: "/" },
      { id: "db", path: "/db" }
    ]);
  });
});
