import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { Knex } from "knex";
import { vi } from "vitest";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretActions as Actions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";

import { resourceMetadataServiceFactory } from "./resource-metadata-service";
import {
  SecretMetadataSearchLogicalOperator,
  SecretMetadataSearchOperator,
  TSearchSecretMetadataDTO
} from "./resource-metadata-types";

const dto = {
  projectId: "project",
  filters: [{ key: "team", value: "platform", operator: SecretMetadataSearchOperator.Is }],
  operator: SecretMetadataSearchLogicalOperator.And,
  actor: { type: "user", id: "user", orgId: "org" }
} as TSearchSecretMetadataDTO;

const candidate = (id: string, encrypted = false) => ({
  secretId: id,
  secretKey: "API_KEY",
  folderId: "child",
  tags: [{ id: "tag", slug: "backend" }],
  metadata: [
    { key: "team", value: encrypted ? null : "platform", encryptedValue: encrypted ? Buffer.from("cipher") : null }
  ]
});

const setup = (
  rules: RawRuleOf<MongoAbility<ProjectPermissionSet>>[] = [
    { action: Actions.DescribeSecret, subject: ProjectPermissionSub.Secrets }
  ]
) => {
  const tx = {};
  const getProjectPermission = vi.fn().mockResolvedValue({
    permission: createMongoAbility<ProjectPermissionSet>(rules)
  }) as unknown as TPermissionServiceFactory["getProjectPermission"];
  const find = vi.fn().mockResolvedValue([{ slug: "dev" }, { slug: "prod" }]);
  const findBySecretPathMultiEnv = vi.fn().mockResolvedValue([{ id: "parent" }]);
  const findByEnvsDeep = vi.fn().mockResolvedValue([{ id: "parent" }, { id: "child" }]);
  const findSecretPathByFolderIds = vi
    .fn()
    .mockResolvedValue([{ id: "child", path: "/app/nested", environmentSlug: "dev" }]);
  const searchSecretMetadata = vi.fn().mockResolvedValue([]);
  const searchSecretMetadataWithEncryptedValues = vi.fn().mockResolvedValue([]);
  const createCipherPairWithDataKey = vi
    .fn()
    .mockResolvedValue({ decryptor: vi.fn().mockReturnValue(Buffer.from("unmatched")) });
  const service = resourceMetadataServiceFactory({
    permissionService: { getProjectPermission },
    projectEnvDAL: { find },
    folderDAL: { findBySecretPathMultiEnv, findByEnvsDeep, findSecretPathByFolderIds },
    resourceMetadataDAL: {
      searchSecretMetadata,
      searchSecretMetadataWithEncryptedValues,
      transaction: async <T>(callback: (transaction: Knex) => Promise<T>) => callback(tx as Knex)
    },
    kmsService: { createCipherPairWithDataKey }
  });
  return {
    service,
    tx,
    find,
    findBySecretPathMultiEnv,
    findByEnvsDeep,
    searchSecretMetadata,
    searchSecretMetadataWithEncryptedValues,
    createCipherPairWithDataKey
  };
};

describe("metadata search scope and candidate limits", () => {
  test("resolves the recursive subtree before running both scoped candidate queries in the transaction", async () => {
    const state = setup();
    await state.service.searchSecretMetadata({ ...dto, environments: ["dev"], secretPath: "/app" });
    expect(state.find).not.toHaveBeenCalled();
    expect(state.findBySecretPathMultiEnv).toHaveBeenCalledWith("project", ["dev"], "/app");
    expect(state.findByEnvsDeep).toHaveBeenCalledWith({ parentIds: ["parent"] });
    for (const search of [state.searchSecretMetadata, state.searchSecretMetadataWithEncryptedValues]) {
      expect(search).toHaveBeenCalledWith(expect.objectContaining({ folderIds: ["parent", "child"] }), state.tx);
    }
  });

  test("defaults to root in all project environments and returns no matches for missing paths", async () => {
    const state = setup();
    state.findBySecretPathMultiEnv.mockResolvedValue([]);
    expect(await state.service.searchSecretMetadata(dto)).toEqual({
      secrets: [],
      searchLimit: 100,
      isSearchLimitReached: false
    });
    expect(state.find).toHaveBeenCalledWith({ projectId: "project" });
    expect(state.findBySecretPathMultiEnv).toHaveBeenCalledWith("project", ["dev", "prod"], "/");
    expect(state.searchSecretMetadata).not.toHaveBeenCalled();
    expect(state.searchSecretMetadataWithEncryptedValues).not.toHaveBeenCalled();
  });

  test("preserves the cap signal when permissions hide every plaintext match", async () => {
    const state = setup([]);
    state.searchSecretMetadata.mockResolvedValue(Array.from({ length: 100 }, (_, index) => candidate(String(index))));
    expect(await state.service.searchSecretMetadata(dto)).toEqual({
      secrets: [],
      searchLimit: 100,
      isSearchLimitReached: true
    });
  });

  test("preserves the cap signal when encrypted candidates do not match", async () => {
    const state = setup();
    state.searchSecretMetadataWithEncryptedValues.mockResolvedValue(
      Array.from({ length: 100 }, (_, index) => candidate(String(index), true))
    );
    expect(await state.service.searchSecretMetadata(dto)).toEqual({
      secrets: [],
      searchLimit: 100,
      isSearchLimitReached: true
    });
  });

  test.each([Actions.ReadValue, Actions.DescribeAndReadValue])(
    "returns tags and permits value access using %s with path, name, environment and tag conditions",
    async (action) => {
      const state = setup([
        { action: Actions.DescribeSecret, subject: ProjectPermissionSub.Secrets },
        {
          action,
          subject: ProjectPermissionSub.Secrets,
          conditions: {
            environment: "dev",
            secretPath: "/app/nested",
            secretName: "API_KEY",
            secretTags: { $in: ["backend"] }
          }
        }
      ]);
      state.searchSecretMetadata.mockResolvedValue([candidate("secret")]);
      const result = await state.service.searchSecretMetadata(dto);
      expect(result.isSearchLimitReached).toBe(false);
      expect(result.secrets).toEqual([
        expect.objectContaining({ tags: [{ id: "tag", slug: "backend" }], secretValueHidden: false })
      ]);
      expect(state.createCipherPairWithDataKey).not.toHaveBeenCalled();
    }
  );

  test("keeps values hidden without a matching read-value permission and filters non-describable secrets", async () => {
    const state = setup([
      {
        action: Actions.DescribeSecret,
        subject: ProjectPermissionSub.Secrets,
        conditions: { secretName: "API_KEY", secretTags: { $in: ["backend"] } }
      },
      { action: Actions.ReadValue, subject: ProjectPermissionSub.Secrets, conditions: { environment: "prod" } }
    ]);
    state.searchSecretMetadata.mockResolvedValue([
      candidate("allowed"),
      { ...candidate("denied"), secretKey: "OTHER_KEY" }
    ]);
    const result = await state.service.searchSecretMetadata(dto);
    expect(result.secrets).toEqual([expect.objectContaining({ secretId: "allowed", secretValueHidden: true })]);
  });
});
