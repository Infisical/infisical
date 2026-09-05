import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
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
  actorId: "user"
} as TGetSecretMetadataDTO;

const setup = (
  rules: RawRuleOf<MongoAbility<ProjectPermissionSet>>[] = [
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

const paginateMetadata =
  (secrets: ReturnType<typeof metadata>[]) =>
  ({ afterId, limit }: { afterId?: string; limit: number }) =>
    Promise.resolve(
      secrets
        .filter(({ id }) => !afterId || id > afterId)
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, limit)
    );

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
    const { folderIds, limit, afterId } = service.findMetadataByFolderIds.mock.calls[0][0];
    expect(folderIds).toHaveLength(302);
    expect(folderIds).toContain("app");
    expect(folderIds).toContain("child");
    expect(folderIds).not.toContain("root");
    expect(folderIds).not.toContain("sibling");
    expect({ limit, afterId }).toEqual({ limit: 500, afterId: undefined });
    expect(result.secrets.map(({ secretPath }) => secretPath)).toEqual(["/app", "/app/nested"]);
    expect(result.nextCursor).toBeNull();
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

  test.each([0, 1, 2, 503])("does not disclose a subtree containing %i restricted secrets", async (count) => {
    const service = setup([
      { action: Actions.DescribeSecret, subject: ProjectPermissionSub.Secrets, conditions: { secretName: "ALLOWED" } }
    ]);
    service.findMetadataByFolderIds.mockImplementation(
      paginateMetadata(Array.from({ length: count }, (_, i) => metadata(`hidden-${i}`)))
    );
    for (const cursor of [undefined, "hidden-0", "zzzz"]) {
      // eslint-disable-next-line no-await-in-loop
      expect(await service.getSecretMetadata({ ...dto, limit: 1, cursor })).toEqual({ secrets: [], nextCursor: null });
    }
  });

  test("hidden rows do not change authorized pages, including duplicate names in different folders", async () => {
    const rules: RawRuleOf<MongoAbility<ProjectPermissionSet>>[] = [
      { action: Actions.DescribeSecret, subject: ProjectPermissionSub.Secrets, conditions: { secretName: "ALLOWED" } }
    ];
    const visible = [
      metadata("1000-one", "app", { key: "ALLOWED" }),
      metadata("2000-two", "child", { key: "ALLOWED" }),
      metadata("2001-three", "child", { key: "ALLOWED" })
    ];
    const unrestricted = setup(rules);
    unrestricted.findMetadataByFolderIds.mockImplementation(paginateMetadata(visible));
    const restricted = setup(rules);
    const hidden = (prefix: string) => Array.from({ length: 503 }, (_, i) => metadata(`${prefix}-${i}`));
    restricted.findMetadataByFolderIds.mockImplementation(
      paginateMetadata([
        ...hidden("0000-before"),
        visible[0],
        ...hidden("1500-between"),
        visible[1],
        visible[2],
        ...hidden("3000-after")
      ])
    );

    for (const limit of [1, 2]) {
      for (const cursor of [undefined, "0500", "1000-one", "1500", "2000-two", "2001-three", "zzzz"]) {
        const request = { ...dto, limit, cursor };
        // eslint-disable-next-line no-await-in-loop
        const expected = await unrestricted.getSecretMetadata(request);
        // eslint-disable-next-line no-await-in-loop
        expect(await restricted.getSecretMetadata(request)).toEqual(expected);
      }
    }
    const first = await restricted.getSecretMetadata(dto);
    expect(first.secrets.map(({ id, secretPath }) => ({ id, secretPath }))).toEqual([
      { id: "1000-one", secretPath: "/app" },
      { id: "2000-two", secretPath: "/app/nested" }
    ]);
    expect(first.nextCursor).toBe("2000-two");
    const last = await restricted.getSecretMetadata({ ...dto, cursor: "2000-two", limit: 1 });
    expect(last.secrets.map(({ id }) => id)).toEqual(["2001-three"]);
    expect(last.nextCursor).toBeNull();
    expect(restricted.findMetadataByFolderIds.mock.calls.every(([request]) => request.limit <= 501)).toBe(true);
  });

  test("honors conditional denies and later grants when advancing past hidden secrets", async () => {
    const service = setup([
      { action: Actions.DescribeSecret, subject: ProjectPermissionSub.Secrets },
      {
        action: Actions.DescribeSecret,
        subject: ProjectPermissionSub.Secrets,
        conditions: { secretPath: "/app" },
        inverted: true
      },
      {
        action: Actions.DescribeSecret,
        subject: ProjectPermissionSub.Secrets,
        conditions: { secretPath: "/app", secretName: "ALLOWED" }
      }
    ]);
    service.findMetadataByFolderIds.mockImplementation(
      paginateMetadata([metadata("hidden"), metadata("one", "app", { key: "ALLOWED" }), metadata("two", "child")])
    );
    const first = await service.getSecretMetadata({ ...dto, limit: 1 });
    expect(first.secrets.map(({ id }) => id)).toEqual(["one"]);
    expect(first.nextCursor).toBe("one");
    const last = await service.getSecretMetadata({ ...dto, limit: 1, cursor: "one" });
    expect(last.secrets.map(({ id }) => id)).toEqual(["two"]);
    expect(last.nextCursor).toBeNull();
  });

  test.each([500, 501, 1000, 10000])("reads %i authorized secrets without rescanning earlier pages", async (count) => {
    const service = setup([
      { action: Actions.DescribeSecret, subject: ProjectPermissionSub.Secrets, conditions: { environment: "dev" } }
    ]);
    const visible = Array.from({ length: count }, (_, i) => metadata(`visible-${String(i).padStart(5, "0")}`));
    service.findMetadataByFolderIds.mockImplementation(paginateMetadata(visible));
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      // eslint-disable-next-line no-await-in-loop
      const page = await service.getSecretMetadata({ ...dto, cursor, limit: 500 });
      ids.push(...page.secrets.map(({ id }) => id));
      expect(page.nextCursor).toBe(ids.length < count ? ids[ids.length - 1] : null);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(ids).toEqual(visible.map(({ id }) => id));
    expect(service.findMetadataByFolderIds).toHaveBeenCalledTimes(Math.ceil(count / 500));
  });

  test("paginates conditional legacy access using environment, path, name and tags", async () => {
    const service = setup([
      {
        action: Actions.DescribeAndReadValue,
        subject: ProjectPermissionSub.Secrets,
        conditions: {
          environment: "dev",
          secretPath: "/app/nested",
          secretName: "ALLOWED",
          secretTags: { $in: ["readable"] }
        }
      }
    ]);
    service.findMetadataByFolderIds.mockImplementation(
      paginateMetadata([
        metadata("wrong-path", "app", { key: "ALLOWED", tagSlugs: ["readable"] }),
        metadata("wrong-name", "child", { tagSlugs: ["readable"] }),
        metadata("wrong-tag", "child", { key: "ALLOWED" }),
        metadata("one", "child", { key: "ALLOWED", tagSlugs: ["readable"] }),
        metadata("two", "child", { key: "ALLOWED", tagSlugs: ["readable"] })
      ])
    );
    const result = await service.getSecretMetadata({ ...dto, limit: 1, cursor: "one" });
    expect(result.secrets.map(({ id }) => id)).toEqual(["two"]);
    expect(result.secrets[0].secretValueHidden).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(await service.getSecretMetadata({ ...dto, environment: "prod", limit: 1 })).toEqual({
      secrets: [],
      nextCursor: null
    });
  });

  test("resumes after the cursor while evaluating value access per secret", async () => {
    const service = setup([
      { action: Actions.DescribeSecret, subject: ProjectPermissionSub.Secrets },
      { action: Actions.ReadValue, subject: ProjectPermissionSub.Secrets, conditions: { secretName: "READABLE" } }
    ]);
    service.findMetadataByFolderIds.mockImplementation(
      paginateMetadata([
        metadata("01-one"),
        metadata("02-two"),
        metadata("03-three"),
        metadata("04-four", "app", { key: "READABLE" })
      ])
    );
    const result = await service.getSecretMetadata({ ...dto, cursor: "02-two" });
    expect(service.findMetadataByFolderIds.mock.calls[0][0].afterId).toBe("02-two");
    expect(service.findMetadataByFolderIds).toHaveBeenCalledTimes(1);
    expect(result.secrets.map(({ id, secretValueHidden }) => ({ id, secretValueHidden }))).toEqual([
      { id: "03-three", secretValueHidden: true },
      { id: "04-four", secretValueHidden: false }
    ]);
    expect(result.nextCursor).toBeNull();
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
    expect(await folderOnly.getSecretMetadata(dto)).toEqual({ secrets: [], nextCursor: null });
    expect(folderOnly.findMetadataByFolderIds).not.toHaveBeenCalled();
    const service = setup();
    expect(await service.getSecretMetadata({ ...dto, secretPath: "/missing" })).toEqual({
      secrets: [],
      nextCursor: null
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
