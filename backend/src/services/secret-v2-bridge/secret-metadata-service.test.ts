import { createMongoAbility } from "@casl/ability";
import { vi } from "vitest";

import { ProjectVersion, SecretType, TSecretFolders } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretActions as Actions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TGetSecretMetadataDTO } from "@app/services/secret/secret-types";

import { secretMetadataServiceFactory } from "./secret-metadata-service";
import { TSecretV2BridgeDALFactory } from "./secret-v2-bridge-dal";

const folder = (id: string, name: string, parentId: string | null) =>
  ({ id, name, parentId, envId: "env", isReserved: false }) as TSecretFolders;
const folders = [
  folder("root", "root", null),
  folder("app", "app", "root"),
  folder("child", "nested", "app"),
  folder("sibling", "app-other", "root")
];
const metadata = (id: string, folderId = "app", extras = {}) => ({
  id,
  folderId,
  key: "SHARED_KEY",
  type: SecretType.Shared,
  isHoneyTokenSecret: false,
  isRotatedSecret: false,
  tagSlugs: [],
  ...extras
});
const dto = {
  projectId: "project",
  environment: "dev",
  secretPath: "/app",
  limit: 2,
  offset: 0,
  actorId: "user"
} as TGetSecretMetadataDTO;

const setup = (
  rules: Parameters<typeof createMongoAbility<ProjectPermissionSet>>[0] = [
    { action: Actions.DescribeSecret, subject: ProjectPermissionSub.Secrets }
  ]
) => {
  const permission = createMongoAbility<ProjectPermissionSet>(rules);
  const getProjectPermission = vi
    .fn()
    .mockResolvedValue({ permission }) as unknown as TPermissionServiceFactory["getProjectPermission"];
  const find = vi.fn().mockResolvedValue(folders);
  const findOne = vi.fn().mockResolvedValue({ id: "env" });
  const findMetadataByFolderIds = vi.fn<TSecretV2BridgeDALFactory["findMetadataByFolderIds"]>().mockResolvedValue([]);
  const findById = vi.fn().mockResolvedValue({ version: ProjectVersion.V3 });
  const service = secretMetadataServiceFactory({
    permissionService: { getProjectPermission },
    folderDAL: { find },
    projectEnvDAL: { findOne },
    projectDAL: { findById },
    secretDAL: { findMetadataByFolderIds }
  });
  return { ...service, findMetadataByFolderIds, getProjectPermission, find, findOne, findById };
};

describe("recursive secret metadata", () => {
  test("queries only the requested subtree once, including hundreds of empty folders", async () => {
    const service = setup();
    service.find.mockResolvedValue([
      ...folders,
      ...Array.from({ length: 300 }, (_, i) => folder(`empty-${i}`, `empty-${i}`, "app"))
    ]);
    service.findMetadataByFolderIds.mockResolvedValue([metadata("one"), metadata("two", "child")]);
    const result = await service.getSecretMetadata(dto);
    expect(service.find).toHaveBeenCalledTimes(1);
    expect(service.findOne).toHaveBeenCalledWith({ projectId: "project", slug: "dev" });
    expect(service.findMetadataByFolderIds).toHaveBeenCalledTimes(1);
    const { folderIds, limit, offset } = service.findMetadataByFolderIds.mock.calls[0][0];
    expect(folderIds).toHaveLength(302);
    expect(folderIds).toContain("app");
    expect(folderIds).toContain("child");
    expect(folderIds).not.toContain("root");
    expect(folderIds).not.toContain("sibling");
    expect({ limit, offset }).toEqual({ limit: 3, offset: 0 });
    expect(result.secrets.map(({ secretPath }) => secretPath)).toEqual(["/app", "/app/nested"]);
    expect(result.nextOffset).toBeNull();
  });

  test("evaluates value access per environment, folder, key and tag without returning sensitive fields", async () => {
    const service = setup([
      { action: Actions.DescribeSecret, subject: ProjectPermissionSub.Secrets },
      {
        action: Actions.ReadValue,
        subject: ProjectPermissionSub.Secrets,
        conditions: {
          environment: "dev",
          secretPath: "/app/nested",
          secretName: "SHARED_KEY",
          secretTags: { $in: ["readable"] }
        }
      }
    ]);
    service.findMetadataByFolderIds.mockResolvedValue([
      metadata("restricted", "app", {
        tagSlugs: ["readable"],
        encryptedValue: "never-return",
        secretValue: "never-return"
      }),
      metadata("readable", "child", { tagSlugs: ["readable"] })
    ]);
    const dev = await service.getSecretMetadata(dto);
    expect(dev.secrets.map(({ secretValueHidden }) => secretValueHidden)).toEqual([true, false]);
    expect(Object.keys(dev.secrets[0]).sort()).toEqual(
      ["id", "isHoneyTokenSecret", "isRotatedSecret", "secretKey", "secretPath", "secretValueHidden", "type"].sort()
    );
    const prod = await service.getSecretMetadata({ ...dto, environment: "prod" });
    expect(prod.secrets.every(({ secretValueHidden }) => secretValueHidden)).toBe(true);
  });

  test("advances beyond an entirely unauthorized page and preserves duplicate names in different folders", async () => {
    const service = setup([
      { action: Actions.DescribeSecret, subject: ProjectPermissionSub.Secrets, conditions: { secretName: "ALLOWED" } }
    ]);
    service.findMetadataByFolderIds.mockResolvedValueOnce([
      metadata("hidden-1"),
      metadata("hidden-2"),
      metadata("next")
    ]);
    expect(await service.getSecretMetadata(dto)).toEqual({ secrets: [], nextOffset: 2 });
    service.findMetadataByFolderIds.mockResolvedValueOnce([
      metadata("one", "app", { key: "ALLOWED" }),
      metadata("two", "child", { key: "ALLOWED" })
    ]);
    const result = await service.getSecretMetadata({ ...dto, offset: 2 });
    expect(result.secrets.map(({ id }) => id)).toEqual(["one", "two"]);
    expect(result.nextOffset).toBeNull();
  });

  test("preserves managed flags and supports legacy read permissions", async () => {
    const service = setup([{ action: Actions.DescribeAndReadValue, subject: ProjectPermissionSub.Secrets }]);
    service.findMetadataByFolderIds.mockResolvedValue([
      metadata("honey", "app", { isHoneyTokenSecret: true }),
      metadata("rotation", "app", { isRotatedSecret: true })
    ]);
    const result = await service.getSecretMetadata(dto);
    expect(result.secrets[0]).toMatchObject({ isHoneyTokenSecret: true, secretValueHidden: false });
    expect(result.secrets[1]).toMatchObject({ isRotatedSecret: true, secretValueHidden: false });
  });

  test("returns no secrets for folder-only users or a nonexistent subtree", async () => {
    const folderOnly = setup([]);
    expect(await folderOnly.getSecretMetadata(dto)).toEqual({ secrets: [], nextOffset: null });
    expect(folderOnly.findMetadataByFolderIds).not.toHaveBeenCalled();
    const service = setup();
    expect(await service.getSecretMetadata({ ...dto, secretPath: "/missing" })).toEqual({
      secrets: [],
      nextOffset: null
    });
    expect(service.findMetadataByFolderIds).not.toHaveBeenCalled();
  });

  test("does not read metadata after project authorization fails", async () => {
    const service = setup();
    vi.mocked(service.getProjectPermission).mockRejectedValue(new Error("Forbidden"));
    await expect(service.getSecretMetadata(dto)).rejects.toThrow("Forbidden");
    expect(service.find).not.toHaveBeenCalled();
    expect(service.findMetadataByFolderIds).not.toHaveBeenCalled();
  });
});
