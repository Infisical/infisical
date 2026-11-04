import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { packRules } from "@casl/ability/extra";

import { ProjectMembershipRole, ProjectType, SecretFolderRole, TemporaryPermissionMode } from "@app/db/schemas";
import { buildProjectPermissionRules } from "@app/ee/services/permission/permission-service";
import { TProjectFolderScopedPrivilege } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { conditionsMatcher } from "@app/lib/casl";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";

import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import {
  assertFullAccessIsPermanent,
  assertManageFolderSubtree,
  computeTemporaryFields,
  recursiveFolderPathGlob,
  resolveFolder
} from "./folder-permission-fns";

describe("computeTemporaryFields", () => {
  test.each([undefined, { isTemporary: false as const }])("returns permanent fields for %o", (input) => {
    expect(computeTemporaryFields(input)).toEqual({
      isTemporary: false,
      temporaryMode: null,
      temporaryRange: null,
      temporaryAccessStartTime: null,
      temporaryAccessEndTime: null
    });
  });

  test("computes a relative window from the provided start time", () => {
    const startTime = "2026-08-18T19:18:50.978Z";
    const result = computeTemporaryFields({
      isTemporary: true,
      temporaryMode: TemporaryPermissionMode.Relative,
      temporaryRange: "4h",
      temporaryAccessStartTime: startTime
    });

    expect(result.isTemporary).toBe(true);
    expect(result.temporaryMode).toBe(TemporaryPermissionMode.Relative);
    expect(result.temporaryRange).toBe("4h");
    expect(result.temporaryAccessStartTime).toEqual(new Date(startTime));
    expect(result.temporaryAccessEndTime!.getTime() - result.temporaryAccessStartTime!.getTime()).toBe(ms("4h"));
  });
});

describe("assertFullAccessIsPermanent", () => {
  test("rejects a temporary full-access grant", () => {
    expect(() => assertFullAccessIsPermanent(SecretFolderRole.FullAccess, true)).toThrow(BadRequestError);
    expect(() => assertFullAccessIsPermanent(SecretFolderRole.FullAccess, true)).toThrow(/cannot be temporary/);
  });

  test("allows a permanent full-access grant", () => {
    expect(() => assertFullAccessIsPermanent(SecretFolderRole.FullAccess, false)).not.toThrow();
  });

  test.each([SecretFolderRole.List, SecretFolderRole.Read, SecretFolderRole.Edit, SecretFolderRole.Manage])(
    "allows a temporary %s grant",
    (role) => {
      expect(() => assertFullAccessIsPermanent(role, true)).not.toThrow();
    }
  );
});

describe("resolveFolder", () => {
  const stubSecretFolderDAL = (result: unknown) =>
    ({
      findBySecretPath: async () => result
    }) as unknown as Pick<TSecretFolderDALFactory, "findBySecretPath">;

  test("throws NotFoundError naming the environment and path when the folder does not exist", async () => {
    await expect(resolveFolder("project-1", "dev", "/missing", stubSecretFolderDAL(undefined))).rejects.toThrow(
      NotFoundError
    );
    await expect(resolveFolder("project-1", "dev", "/missing", stubSecretFolderDAL(undefined))).rejects.toThrow(
      /'\/missing'.*'dev'/
    );
  });

  test("throws BadRequestError for a reserved folder", async () => {
    const folder = { id: "folder-1", path: "/reserved", isReserved: true, environment: { slug: "dev" } };
    await expect(resolveFolder("project-1", "dev", "/reserved", stubSecretFolderDAL(folder))).rejects.toThrow(
      BadRequestError
    );
  });

  test("returns the folder id and canonical path and environment slug", async () => {
    const folder = { id: "folder-1", path: "/app", isReserved: false, environment: { slug: "dev" } };
    await expect(resolveFolder("project-1", "dev", "/app/", stubSecretFolderDAL(folder))).resolves.toEqual({
      id: "folder-1",
      path: "/app",
      environmentSlug: "dev"
    });
  });
});

describe("recursiveFolderPathGlob", () => {
  test.each([
    ["/", "/**"],
    ["/a", "/a/**"],
    ["/a/b", "/a/b/**"]
  ])("builds the subtree glob for %s", (path, glob) => {
    expect(recursiveFolderPathGlob(path)).toBe(glob);
  });
});

describe("assertManageFolderSubtree", () => {
  const folder = (path: string) => ({ id: "folder-id", path, environmentSlug: "dev" });

  const manageAccessRole = (secretPath: string) => ({
    role: ProjectMembershipRole.Custom,
    permissions: packRules([
      {
        action: ProjectPermissionSecretFolderActions.ManageAccess,
        subject: ProjectPermissionSub.SecretFolders,
        conditions: { environment: "dev", secretPath: { $glob: secretPath } }
      }
    ])
  });

  const folderGrant = (role: SecretFolderRole, secretPath: string): TProjectFolderScopedPrivilege => ({
    id: "privilege-id",
    folderId: "granted-folder-id",
    role,
    environmentSlug: "dev",
    secretPath
  });

  const abilityFor = (roles: { role: string; permissions?: unknown }[], privileges?: TProjectFolderScopedPrivilege[]) =>
    createMongoAbility<ProjectPermissionSet>(
      buildProjectPermissionRules(roles, ProjectType.SecretManager, privileges) as RawRuleOf<
        MongoAbility<ProjectPermissionSet>
      >[],
      { conditionsMatcher }
    );

  test("allows a project admin", () => {
    const caller = abilityFor([{ role: ProjectMembershipRole.Admin, permissions: [] }]);

    expect(() => assertManageFolderSubtree(caller, folder("/a"))).not.toThrow();
    expect(() => assertManageFolderSubtree(caller, folder("/"))).not.toThrow();
  });

  test("allows a role that manages access on the folder and everything below it", () => {
    const caller = abilityFor([manageAccessRole("/a/**")]);

    expect(() => assertManageFolderSubtree(caller, folder("/a"))).not.toThrow();
    expect(() => assertManageFolderSubtree(caller, folder("/a/b"))).not.toThrow();
  });

  test("rejects a folder outside the role's subtree", () => {
    const caller = abilityFor([manageAccessRole("/a/**")]);

    expect(() => assertManageFolderSubtree(caller, folder("/b"))).toThrow(ForbiddenRequestError);
    expect(() => assertManageFolderSubtree(caller, folder("/"))).toThrow(ForbiddenRequestError);
  });

  test("rejects a role that only reaches the folder's direct children", () => {
    const caller = abilityFor([manageAccessRole("/a/*")]);

    expect(() => assertManageFolderSubtree(caller, folder("/a"))).toThrow(ForbiddenRequestError);
  });

  test("rejects a caller whose manage access comes from a full-access grant on that folder only", () => {
    const caller = abilityFor(
      [{ role: ProjectMembershipRole.Member, permissions: [] }],
      [folderGrant(SecretFolderRole.FullAccess, "/a")]
    );

    expect(() => assertManageFolderSubtree(caller, folder("/a"))).toThrow(ForbiddenRequestError);
  });

  test("rejects a subtree where a lower-tier folder grant takes manage access away", () => {
    const caller = abilityFor([manageAccessRole("/**")], [folderGrant(SecretFolderRole.Read, "/a/b")]);

    expect(() => assertManageFolderSubtree(caller, folder("/a"))).toThrow(ForbiddenRequestError);
    expect(() => assertManageFolderSubtree(caller, folder("/c"))).not.toThrow();
  });

  test("names the folder and environment in the error", () => {
    const caller = abilityFor([{ role: ProjectMembershipRole.Member, permissions: [] }]);

    expect(() => assertManageFolderSubtree(caller, folder("/a"))).toThrow(/'\/a' and every folder below it.*'dev'/);
  });
});
