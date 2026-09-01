import { packRules } from "@casl/ability/extra";
import { vi } from "vitest";

import { NotFoundError } from "@app/lib/errors";

import { OrgPermissionActions, OrgPermissionSubjects } from "./org-permission";
import { permissionServiceFactory } from "./permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "./project-permission";

// A membership row can outlive the role slug it points at: a product gets removed and its slugs stop
// resolving, while the rows that reference them stay. buildProjectPermissionRules already tolerates
// that (unknown slug -> no rules). These cover the same tolerance on the by-roles lookups, which the
// privilege-boundary guards use to measure roles a principal already holds -- without it, a member
// carrying a stale slug could not be removed at all, because the boundary check 404s first.

const CUSTOM_ROLE_SLUG = "release-manager";

const createService = () => {
  const roleDAL = {
    find: vi.fn().mockImplementation(({ $in }: { $in: { slug: string[] } }) =>
      $in.slug.includes(CUSTOM_ROLE_SLUG)
        ? [
            {
              id: "role-id",
              name: CUSTOM_ROLE_SLUG,
              slug: CUSTOM_ROLE_SLUG,
              permissions: packRules([
                { subject: ProjectPermissionSub.SecretFolders, action: [ProjectPermissionActions.Read] }
              ])
            }
          ]
        : []
    )
  };

  const service = permissionServiceFactory({
    roleDAL,
    projectDAL: { findById: vi.fn().mockResolvedValue({ id: "project-id", type: "secret-manager" }) },
    serviceTokenDAL: {} as never,
    permissionDAL: {} as never,
    keyStore: {} as never,
    userDAL: {} as never,
    identityDAL: {} as never,
    additionalPrivilegeDAL: {} as never,
    groupDAL: {} as never,
    secretFolderDAL: {} as never
  } as never);

  return { service, roleDAL };
};

describe("getOrgPermissionByRoles", () => {
  test("throws by default so an assignment of a role that does not exist is rejected", async () => {
    const { service } = createService();

    await expect(service.getOrgPermissionByRoles(["ssh-host-bootstrapper"], "org-id")).rejects.toThrow(NotFoundError);
  });

  test("drops the unresolved slug when the caller asks for it", async () => {
    const { service } = createService();

    const result = await service.getOrgPermissionByRoles(["ssh-host-bootstrapper"], "org-id", {
      ignoreUnresolvedRoles: true
    });

    expect(result).toEqual([]);
  });

  test("keeps the roles that do resolve alongside one that does not", async () => {
    const { service } = createService();

    const result = await service.getOrgPermissionByRoles(["admin", "ssh-host-bootstrapper"], "org-id", {
      ignoreUnresolvedRoles: true
    });

    expect(result).toHaveLength(1);
    expect(result[0].permission.can(OrgPermissionActions.Delete, OrgPermissionSubjects.Member)).toBe(true);
  });
});

describe("getProjectPermissionByRoles", () => {
  test("throws by default so an assignment of a role that does not exist is rejected", async () => {
    const { service } = createService();

    await expect(service.getProjectPermissionByRoles(["ssh-host-bootstrapper"], "project-id")).rejects.toThrow(
      NotFoundError
    );
  });

  test("drops the unresolved slug when the caller asks for it", async () => {
    const { service } = createService();

    const result = await service.getProjectPermissionByRoles(["ssh-host-bootstrapper"], "project-id", {
      ignoreUnresolvedRoles: true
    });

    expect(result).toEqual([]);
  });

  test("still resolves a custom role sitting next to an unresolved slug", async () => {
    const { service } = createService();

    const result = await service.getProjectPermissionByRoles(
      [CUSTOM_ROLE_SLUG, "ssh-host-bootstrapper"],
      "project-id",
      {
        ignoreUnresolvedRoles: true
      }
    );

    expect(result).toHaveLength(1);
    expect(result[0].role?.slug).toBe(CUSTOM_ROLE_SLUG);
    expect(result[0].permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretFolders)).toBe(true);
  });

  test("a built-in slug resolves without touching the custom-role table", async () => {
    const { service, roleDAL } = createService();

    const result = await service.getProjectPermissionByRoles(["admin"], "project-id", {
      ignoreUnresolvedRoles: true
    });

    expect(result).toHaveLength(1);
    expect(roleDAL.find).not.toHaveBeenCalled();
  });
});
