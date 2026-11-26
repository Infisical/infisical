import { describe, expect, it } from "vitest";

import { SecretFolderRole, TFolderAccess } from "@app/hooks/api/folderAccess/types";

import { findInheritedGrant } from "./folder-access.utils";

const grantOn = (secretPath: string, overrides: Partial<TFolderAccess> = {}): TFolderAccess => ({
  id: `grant-${secretPath}`,
  projectId: "project",
  folderId: `folder-${secretPath}`,
  permission: SecretFolderRole.Read,
  environment: "dev",
  secretPath,
  isTemporary: false,
  temporaryMode: null,
  temporaryRange: null,
  temporaryAccessStartTime: null,
  temporaryAccessEndTime: null,
  isPermissionRecursive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides
});

describe("findInheritedGrant", () => {
  it("picks the nearest folder above when several apply to subfolders", () => {
    const grants = [grantOn("/"), grantOn("/a"), grantOn("/a/b/c")];
    expect(findInheritedGrant(grants, "dev", "/a/b/c")?.secretPath).toBe("/a");
  });

  it("falls back to the root folder", () => {
    expect(findInheritedGrant([grantOn("/")], "dev", "/a/b")?.secretPath).toBe("/");
  });

  it("matches paths with a trailing slash", () => {
    expect(findInheritedGrant([grantOn("/a/")], "dev", "/a/b/")?.secretPath).toBe("/a/");
  });

  it("ignores a sibling whose name is a prefix of the folder", () => {
    expect(findInheritedGrant([grantOn("/a")], "dev", "/ab/c")).toBeNull();
  });

  it("ignores a grant on the folder itself", () => {
    expect(findInheritedGrant([grantOn("/a")], "dev", "/a")).toBeNull();
  });

  it("returns nothing on the root folder", () => {
    expect(findInheritedGrant([grantOn("/")], "dev", "/")).toBeNull();
  });

  it("ignores grants that do not apply to subfolders", () => {
    const grants = [grantOn("/"), grantOn("/a", { isPermissionRecursive: false })];
    expect(findInheritedGrant(grants, "dev", "/a/b")?.secretPath).toBe("/");
  });

  it("ignores expired grants", () => {
    const grants = [
      grantOn("/"),
      grantOn("/a", { isTemporary: true, temporaryAccessEndTime: "2020-01-01T00:00:00.000Z" })
    ];
    expect(findInheritedGrant(grants, "dev", "/a/b")?.secretPath).toBe("/");
  });

  it("ignores grants in another environment", () => {
    expect(findInheritedGrant([grantOn("/", { environment: "prod" })], "dev", "/a")).toBeNull();
  });
});
