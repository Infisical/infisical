import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { Knex } from "knex";
import { vi } from "vitest";

import { TSecretFolders } from "@app/db/schemas";
import {
  ProjectPermissionActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TSecretChangePolicyServiceFactory } from "@app/ee/services/secret-change-policy/secret-change-policy-service";
import { conditionsMatcher } from "@app/lib/casl";
import { BadRequestError } from "@app/lib/errors";

import { TAdditionalPrivilegeDALFactory } from "../additional-privilege/additional-privilege-dal";
import { ActorType } from "../auth/auth-type";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretFolderDALFactory } from "./secret-folder-dal";
import {
  assertFolderDeleteAllowed,
  assertFolderRenameAllowed,
  assertNoOverlappingFolderEntries,
  buildChildrenMap,
  buildFolderIdMap,
  buildFolderPath,
  checkFolderHasRbacPolicies,
  findFoldersWithContent,
  findPolicyProtectedFolder,
  resolveBatchFolderEntries,
  resolveClosestFolder,
  resolvePathToFolder,
  TFolderContent,
  TFolderContentAccess,
  TPolicyProtectedFolder
} from "./secret-folder-fns";

const makeFolder = (id: string, name: string, parentId: string | null, envId: string = "env-1"): TSecretFolders => ({
  id,
  name,
  parentId,
  envId,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  isReserved: false,
  description: null,
  lastSecretModified: null
});

// Reusable folder tree fixture:
//
//  root (parentId=null)
//  ├── folder-a
//  │   ├── folder-b
//  │   │   └── folder-c
//  │   └── folder-d
//  └── folder-e
//
const root = makeFolder("root-id", "root", null);
const folderA = makeFolder("a-id", "folder-a", "root-id");
const folderB = makeFolder("b-id", "folder-b", "a-id");
const folderC = makeFolder("c-id", "folder-c", "b-id");
const folderD = makeFolder("d-id", "folder-d", "a-id");
const folderE = makeFolder("e-id", "folder-e", "root-id");

const allFolders = [root, folderA, folderB, folderC, folderD, folderE];

describe("buildFolderIdMap", () => {
  test("builds a map keyed by folder id", () => {
    const map = buildFolderIdMap(allFolders);
    expect(Object.keys(map)).toHaveLength(6);
    expect(map["root-id"]).toBe(root);
    expect(map["a-id"]).toBe(folderA);
    expect(map["c-id"]).toBe(folderC);
  });

  test("returns empty map for empty input", () => {
    const map = buildFolderIdMap([]);
    expect(Object.keys(map)).toHaveLength(0);
  });
});

describe("buildChildrenMap", () => {
  test("groups folders by parentId", () => {
    const map = buildChildrenMap(allFolders);
    // root has parentId=null -> key "null"
    expect(map.null).toHaveLength(1);
    expect(map.null[0]).toBe(root);

    // root's children
    expect(map["root-id"]).toHaveLength(2);
    expect(map["root-id"].map((f) => f.name).sort()).toEqual(["folder-a", "folder-e"]);

    // folder-a's children
    expect(map["a-id"]).toHaveLength(2);
    expect(map["a-id"].map((f) => f.name).sort()).toEqual(["folder-b", "folder-d"]);

    // folder-b has one child
    expect(map["b-id"]).toHaveLength(1);
    expect(map["b-id"][0].name).toBe("folder-c");

    // leaf folders have no children entries
    expect(map["c-id"]).toBeUndefined();
    expect(map["d-id"]).toBeUndefined();
    expect(map["e-id"]).toBeUndefined();
  });

  test("returns map with no entries for empty input", () => {
    const map = buildChildrenMap([]);
    expect(Object.keys(map)).toHaveLength(0);
  });
});

describe("buildFolderPath", () => {
  const idMap = buildFolderIdMap(allFolders);

  test("returns '/' for root folder", () => {
    expect(buildFolderPath(root, idMap)).toBe("/");
  });

  test("returns correct path for first-level folder", () => {
    expect(buildFolderPath(folderA, idMap)).toBe("/folder-a");
    expect(buildFolderPath(folderE, idMap)).toBe("/folder-e");
  });

  test("returns correct path for deeply nested folder", () => {
    expect(buildFolderPath(folderC, idMap)).toBe("/folder-a/folder-b/folder-c");
  });

  test("returns correct path for second-level folder", () => {
    expect(buildFolderPath(folderB, idMap)).toBe("/folder-a/folder-b");
  });

  test("returns correct path for sibling folder", () => {
    expect(buildFolderPath(folderD, idMap)).toBe("/folder-a/folder-d");
  });

  test("handles orphaned folder with missing parent gracefully", () => {
    // Folder whose parentId points to a non-existent folder
    const orphan = makeFolder("orphan-id", "orphan", "missing-parent-id");
    const orphanMap = buildFolderIdMap([orphan]);

    // Should not throw — returns path treating orphan as top-level
    expect(buildFolderPath(orphan, orphanMap)).toBe("/orphan");
  });

  test("throws when depth exceeds 20", () => {
    // Create a chain of 22 folders (root + 21 children)
    const deepFolders: TSecretFolders[] = [makeFolder("deep-0", "root", null)];
    // eslint-disable-next-line no-plusplus
    for (let i = 1; i <= 22; i++) {
      deepFolders.push(makeFolder(`deep-${i}`, `level${i}`, `deep-${i - 1}`));
    }
    const deepMap = buildFolderIdMap(deepFolders);
    const leaf = deepFolders[deepFolders.length - 1];

    expect(() => buildFolderPath(leaf, deepMap)).toThrow("Maximum folder depth of 20 exceeded");
  });
});

describe("resolvePathToFolder", () => {
  const childrenMap = buildChildrenMap(allFolders);

  test("returns root for empty path segments (path '/')", () => {
    const result = resolvePathToFolder(childrenMap, []);
    expect(result).toBe(root);
  });

  test("resolves first-level path", () => {
    const result = resolvePathToFolder(childrenMap, ["folder-a"]);
    expect(result).toBe(folderA);
  });

  test("resolves deeply nested path", () => {
    const result = resolvePathToFolder(childrenMap, ["folder-a", "folder-b", "folder-c"]);
    expect(result).toBe(folderC);
  });

  test("resolves sibling path", () => {
    const result = resolvePathToFolder(childrenMap, ["folder-a", "folder-d"]);
    expect(result).toBe(folderD);
  });

  test("resolves second top-level folder", () => {
    const result = resolvePathToFolder(childrenMap, ["folder-e"]);
    expect(result).toBe(folderE);
  });

  test("returns undefined for nonexistent first segment", () => {
    const result = resolvePathToFolder(childrenMap, ["nonexistent"]);
    expect(result).toBeUndefined();
  });

  test("returns undefined for nonexistent deep segment", () => {
    const result = resolvePathToFolder(childrenMap, ["folder-a", "nonexistent"]);
    expect(result).toBeUndefined();
  });

  test("returns undefined for partially valid path with extra segment", () => {
    const result = resolvePathToFolder(childrenMap, ["folder-a", "folder-b", "folder-c", "extra"]);
    expect(result).toBeUndefined();
  });

  test("returns undefined when no root folder exists", () => {
    const noRootMap = buildChildrenMap([folderA, folderB]);
    const result = resolvePathToFolder(noRootMap, []);
    expect(result).toBeUndefined();
  });

  test("returns undefined for empty children map", () => {
    const result = resolvePathToFolder({}, ["folder-a"]);
    expect(result).toBeUndefined();
  });
});

describe("resolveClosestFolder", () => {
  const childrenMap = buildChildrenMap(allFolders);

  test("returns root for empty path segments (path '/')", () => {
    const result = resolveClosestFolder(childrenMap, []);
    expect(result).toBe(root);
  });

  test("resolves exact match at first level", () => {
    const result = resolveClosestFolder(childrenMap, ["folder-a"]);
    expect(result).toBe(folderA);
  });

  test("resolves exact match at deep level", () => {
    const result = resolveClosestFolder(childrenMap, ["folder-a", "folder-b", "folder-c"]);
    expect(result).toBe(folderC);
  });

  test("returns root when first segment doesn't match", () => {
    const result = resolveClosestFolder(childrenMap, ["nonexistent"]);
    expect(result).toBe(root);
  });

  test("returns deepest matching folder when path partially exists", () => {
    const result = resolveClosestFolder(childrenMap, ["folder-a", "nonexistent"]);
    expect(result).toBe(folderA);
  });

  test("returns deepest matching folder for longer nonexistent path", () => {
    const result = resolveClosestFolder(childrenMap, ["folder-a", "folder-b", "nonexistent", "deep"]);
    expect(result).toBe(folderB);
  });

  test("returns leaf folder even with extra trailing segments", () => {
    const result = resolveClosestFolder(childrenMap, ["folder-a", "folder-b", "folder-c", "extra"]);
    expect(result).toBe(folderC);
  });

  test("returns undefined when no root folder exists", () => {
    const noRootMap = buildChildrenMap([folderA, folderB]);
    const result = resolveClosestFolder(noRootMap, ["folder-a"]);
    expect(result).toBeUndefined();
  });
});

describe("multi-environment folder resolution", () => {
  // Simulate two environments sharing the same folder names but different IDs
  const env1Root = makeFolder("env1-root", "root", null, "env-1");
  const env1FolderA = makeFolder("env1-a", "shared-name", "env1-root", "env-1");

  const env2Root = makeFolder("env2-root", "root", null, "env-2");
  const env2FolderA = makeFolder("env2-a", "shared-name", "env2-root", "env-2");

  test("resolves paths independently per environment", () => {
    const env1Map = buildChildrenMap([env1Root, env1FolderA]);
    const env2Map = buildChildrenMap([env2Root, env2FolderA]);

    const result1 = resolvePathToFolder(env1Map, ["shared-name"]);
    const result2 = resolvePathToFolder(env2Map, ["shared-name"]);

    expect(result1?.id).toBe("env1-a");
    expect(result2?.id).toBe("env2-a");
    expect(result1?.id).not.toBe(result2?.id);
  });

  test("buildFolderPath works per environment", () => {
    const env1IdMap = buildFolderIdMap([env1Root, env1FolderA]);
    const env2IdMap = buildFolderIdMap([env2Root, env2FolderA]);

    expect(buildFolderPath(env1FolderA, env1IdMap)).toBe("/shared-name");
    expect(buildFolderPath(env2FolderA, env2IdMap)).toBe("/shared-name");
  });
});

describe("edge cases", () => {
  test("single root folder with no children", () => {
    const onlyRoot = makeFolder("only-root", "root", null);
    const childrenMap = buildChildrenMap([onlyRoot]);

    expect(resolvePathToFolder(childrenMap, [])).toBe(onlyRoot);
    expect(resolvePathToFolder(childrenMap, ["anything"])).toBeUndefined();
    expect(resolveClosestFolder(childrenMap, [])).toBe(onlyRoot);
    expect(resolveClosestFolder(childrenMap, ["anything"])).toBe(onlyRoot);
  });

  test("deeply nested chain (10 levels)", () => {
    const folders: TSecretFolders[] = [makeFolder("chain-0", "root", null)];
    const segments: string[] = [];
    // eslint-disable-next-line no-plusplus
    for (let i = 1; i <= 10; i++) {
      const name = `depth-${i}`;
      folders.push(makeFolder(`chain-${i}`, name, `chain-${i - 1}`));
      segments.push(name);
    }

    const childrenMap = buildChildrenMap(folders);
    const idMap = buildFolderIdMap(folders);

    // resolvePathToFolder should reach the deepest folder
    const deepest = resolvePathToFolder(childrenMap, segments);
    expect(deepest?.id).toBe("chain-10");
    expect(deepest?.name).toBe("depth-10");

    // buildFolderPath should produce the full path
    const path = buildFolderPath(folders[10], idMap);
    expect(path).toBe("/depth-1/depth-2/depth-3/depth-4/depth-5/depth-6/depth-7/depth-8/depth-9/depth-10");

    // Partial path should resolve correctly
    const partial = resolvePathToFolder(childrenMap, segments.slice(0, 5));
    expect(partial?.id).toBe("chain-5");
  });

  test("folders with similar name prefixes", () => {
    const similarRoot = makeFolder("sim-root", "root", null);
    const folderProd = makeFolder("sim-prod", "prod", "sim-root");
    const folderProdDb = makeFolder("sim-prod-db", "prod-db", "sim-root");
    const folderProduction = makeFolder("sim-production", "production", "sim-root");

    const childrenMap = buildChildrenMap([similarRoot, folderProd, folderProdDb, folderProduction]);

    expect(resolvePathToFolder(childrenMap, ["prod"])?.id).toBe("sim-prod");
    expect(resolvePathToFolder(childrenMap, ["prod-db"])?.id).toBe("sim-prod-db");
    expect(resolvePathToFolder(childrenMap, ["production"])?.id).toBe("sim-production");
    // Exact match required — no prefix matching
    expect(resolvePathToFolder(childrenMap, ["pro"])).toBeUndefined();
  });

  test("multiple root folders — picks the first one with parentId=null", () => {
    const firstRoot = makeFolder("first-root", "root", null);
    const secondRoot = makeFolder("second-root", "also-root", null);
    const child = makeFolder("child-of-first", "child", "first-root");

    const childrenMap = buildChildrenMap([firstRoot, secondRoot, child]);

    // First entry in the null key wins — doesn't depend on name
    expect(resolvePathToFolder(childrenMap, [])?.id).toBe("first-root");
    expect(resolvePathToFolder(childrenMap, ["child"])?.id).toBe("child-of-first");
  });

  test("root folder does not need to be named 'root'", () => {
    const customRoot = makeFolder("custom-root", "my-custom-root-name", null);
    const child = makeFolder("child-1", "folder-a", "custom-root");

    const childrenMap = buildChildrenMap([customRoot, child]);

    expect(resolvePathToFolder(childrenMap, [])?.id).toBe("custom-root");
    expect(resolvePathToFolder(childrenMap, ["folder-a"])?.id).toBe("child-1");
    expect(resolveClosestFolder(childrenMap, [])?.id).toBe("custom-root");
    expect(resolveClosestFolder(childrenMap, ["folder-a"])?.id).toBe("child-1");
    expect(resolveClosestFolder(childrenMap, ["nonexistent"])?.id).toBe("custom-root");
  });
});

describe("checkFolderHasRbacPolicies", () => {
  const tx = {} as Knex;
  const subtree = [{ id: "root-id" }, { id: "a-id" }, { id: "b-id" }];

  const makeDAL = (rows: { id: string }[]) => {
    const find = vi.fn().mockResolvedValue(rows);
    return { dal: { find } as unknown as Pick<TAdditionalPrivilegeDALFactory, "find">, find };
  };

  test("returns true when a folder-scoped privilege exists in the subtree", async () => {
    const { dal } = makeDAL([{ id: "privilege-1" }]);

    await expect(checkFolderHasRbacPolicies({ subtree }, { additionalPrivilegeDAL: dal }, tx)).resolves.toBe(true);
  });

  test("returns false when no folder-scoped privilege exists", async () => {
    const { dal } = makeDAL([]);

    await expect(checkFolderHasRbacPolicies({ subtree }, { additionalPrivilegeDAL: dal }, tx)).resolves.toBe(false);
  });

  test("returns false without querying for an empty subtree", async () => {
    const { dal, find } = makeDAL([{ id: "privilege-1" }]);

    await expect(checkFolderHasRbacPolicies({ subtree: [] }, { additionalPrivilegeDAL: dal }, tx)).resolves.toBe(false);
    expect(find).not.toHaveBeenCalled();
  });

  test("queries once with every subtree folder id, limit 1 and the provided transaction", async () => {
    const { dal, find } = makeDAL([]);

    await checkFolderHasRbacPolicies({ subtree }, { additionalPrivilegeDAL: dal }, tx);

    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith({ $in: { folderId: ["root-id", "a-id", "b-id"] } }, { limit: 1, tx });
  });
});

describe("findFoldersWithContent", () => {
  const tx = {} as Knex;

  const makeDeps = (secretFolderIds: string[], importFolderIds: string[]) => {
    const findFolderIdsWithSecrets = vi.fn().mockResolvedValue(secretFolderIds);
    const findFolderIdsWithImports = vi.fn().mockResolvedValue(importFolderIds);
    return {
      deps: {
        secretV2BridgeDAL: { findFolderIdsWithSecrets } as unknown as Pick<
          TSecretV2BridgeDALFactory,
          "findFolderIdsWithSecrets"
        >,
        secretImportDAL: { findFolderIdsWithImports } as unknown as Pick<
          TSecretImportDALFactory,
          "findFolderIdsWithImports"
        >
      },
      findFolderIdsWithSecrets,
      findFolderIdsWithImports
    };
  };

  test("collects the folders holding secrets and the folders holding imports, in the transaction", async () => {
    const { deps, findFolderIdsWithSecrets, findFolderIdsWithImports } = makeDeps(["a-id"], ["b-id"]);

    const content = await findFoldersWithContent(["a-id", "b-id", "c-id"], deps, tx);

    expect(content.secretFolderIds).toEqual(new Set(["a-id"]));
    expect(content.importFolderIds).toEqual(new Set(["b-id"]));
    expect(findFolderIdsWithSecrets).toHaveBeenCalledWith(["a-id", "b-id", "c-id"], tx);
    expect(findFolderIdsWithImports).toHaveBeenCalledWith(["a-id", "b-id", "c-id"], tx);
  });

  test("returns empty sets without querying for no folders", async () => {
    const { deps, findFolderIdsWithSecrets, findFolderIdsWithImports } = makeDeps(["a-id"], ["b-id"]);

    const content = await findFoldersWithContent([], deps, tx);

    expect(content.secretFolderIds.size).toBe(0);
    expect(content.importFolderIds.size).toBe(0);
    expect(findFolderIdsWithSecrets).not.toHaveBeenCalled();
    expect(findFolderIdsWithImports).not.toHaveBeenCalled();
  });
});

describe("findPolicyProtectedFolder", () => {
  const tx = {} as Knex;
  const folders = [
    { id: "app-id", path: "/app" },
    { id: "api-id", path: "/app/api" },
    { id: "web-id", path: "/app/web" }
  ];
  const guard = { name: "prod-guard", bypassForMachineIdentities: false };
  const identityBypass = { name: "bot-guard", bypassForMachineIdentities: true };

  const makeContent = ({ secrets = [], imports = [] }: { secrets?: string[]; imports?: string[] }): TFolderContent => ({
    secretFolderIds: new Set(secrets),
    importFolderIds: new Set(imports)
  });

  const makeService = (policies: [string, { name: string; bypassForMachineIdentities: boolean }][]) => {
    const getSecretApprovalPolicyByPaths = vi.fn().mockResolvedValue(new Map(policies));
    return {
      deps: {
        secretChangePolicyService: { getSecretApprovalPolicyByPaths } as unknown as Pick<
          TSecretChangePolicyServiceFactory,
          "getSecretApprovalPolicyByPaths"
        >
      },
      getSecretApprovalPolicyByPaths
    };
  };

  const find = (
    content: TFolderContent,
    deps: ReturnType<typeof makeService>["deps"],
    actor: ActorType = ActorType.USER
  ) => findPolicyProtectedFolder({ folders, content, projectId: "project-1", environment: "dev", actor }, deps, tx);

  test("returns null without a policy lookup when no folder holds secrets or imports", async () => {
    const { deps, getSecretApprovalPolicyByPaths } = makeService([["/app", guard]]);

    await expect(find(makeContent({}), deps)).resolves.toBeNull();
    expect(getSecretApprovalPolicyByPaths).not.toHaveBeenCalled();
  });

  test("looks up only the folders with content, once, in the transaction", async () => {
    const { deps, getSecretApprovalPolicyByPaths } = makeService([]);

    await expect(find(makeContent({ secrets: ["web-id"], imports: ["api-id"] }), deps)).resolves.toBeNull();
    expect(getSecretApprovalPolicyByPaths).toHaveBeenCalledTimes(1);
    expect(getSecretApprovalPolicyByPaths).toHaveBeenCalledWith("project-1", "dev", ["/app/api", "/app/web"], tx);
  });

  test("reports the first protected folder in input order", async () => {
    const { deps } = makeService([
      ["/app/api", guard],
      ["/app/web", guard]
    ]);

    await expect(find(makeContent({ secrets: ["web-id", "api-id"] }), deps)).resolves.toEqual({
      path: "/app/api",
      contentPath: "/app/api",
      policyName: "prod-guard",
      protects: "secret"
    });
  });

  test("reports a secret import when the folder holds only imports", async () => {
    const { deps } = makeService([["/app/api", guard]]);

    await expect(find(makeContent({ imports: ["api-id"] }), deps)).resolves.toEqual({
      path: "/app/api",
      contentPath: "/app/api",
      policyName: "prod-guard",
      protects: "secret_import"
    });
  });

  test("reports where the content lives now when it differs from the checked path", async () => {
    const { deps } = makeService([["/prod/api", guard]]);

    await expect(
      findPolicyProtectedFolder(
        {
          folders: [{ id: "api-id", path: "/prod/api", contentPath: "/staging/api" }],
          content: makeContent({ secrets: ["api-id"] }),
          projectId: "project-1",
          environment: "dev",
          actor: ActorType.USER
        },
        deps,
        tx
      )
    ).resolves.toMatchObject({ path: "/prod/api", contentPath: "/staging/api" });
  });

  test("reports a secret when the folder holds both secrets and imports", async () => {
    const { deps } = makeService([["/app/api", guard]]);

    await expect(find(makeContent({ secrets: ["api-id"], imports: ["api-id"] }), deps)).resolves.toMatchObject({
      protects: "secret"
    });
  });

  test("lets a machine identity through a policy that bypasses identities, but not a user", async () => {
    const { deps } = makeService([["/app", identityBypass]]);
    const content = makeContent({ secrets: ["app-id"] });

    await expect(find(content, deps, ActorType.IDENTITY)).resolves.toBeNull();
    await expect(find(content, deps, ActorType.USER)).resolves.toMatchObject({ policyName: "bot-guard" });
  });

  test("skips a bypassed folder and reports the next one the policy applies to", async () => {
    const { deps } = makeService([
      ["/app", identityBypass],
      ["/app/api", guard]
    ]);

    await expect(find(makeContent({ secrets: ["app-id", "api-id"] }), deps, ActorType.IDENTITY)).resolves.toMatchObject(
      { path: "/app/api", policyName: "prod-guard" }
    );
  });
});

const buildAccess = (rules: RawRuleOf<MongoAbility<ProjectPermissionSet>>[]): TFolderContentAccess => ({
  permission: createMongoAbility<ProjectPermissionSet>(rules, { conditionsMatcher }),
  environment: "dev"
});

const canReadAll = buildAccess([
  { action: ProjectPermissionSecretActions.DescribeSecret, subject: ProjectPermissionSub.Secrets },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.SecretImports }
]);
const canReadNothing = buildAccess([]);

const protectedAt = (
  path: string,
  protects: TPolicyProtectedFolder["protects"],
  contentPath: string = path
): TPolicyProtectedFolder => ({ path, contentPath, policyName: "prod-guard", protects });

const thrown = (fn: () => void) => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the change to be refused");
};

describe("assertFolderDeleteAllowed", () => {
  test("refuses a delete when a change policy covers a secret in the tree", () => {
    const error = thrown(() => assertFolderDeleteAllowed(protectedAt("/app/api", "secret"), canReadAll));

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error).toMatchObject({
      name: "DeleteFolderProtectedByPolicy",
      message:
        'You cannot delete the selected folder because it contains one or more secrets that are protected by the change policy "prod-guard" at folder path "/app/api". Please remove the secrets at folder path "/app/api" and try again.'
    });
  });

  test("refuses a delete when a change policy covers a secret import in the tree", () => {
    const error = thrown(() => assertFolderDeleteAllowed(protectedAt("/app/api", "secret_import"), canReadAll));

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error).toMatchObject({
      name: "DeleteFolderImportProtectedByPolicy",
      message:
        'You cannot delete the selected folder because it contains one or more secret imports that are protected by the change policy "prod-guard" at folder path "/app/api". Please remove the secret imports at folder path "/app/api" and try again.'
    });
  });

  test.each(["secret", "secret_import"] as const)(
    "refuses with a generic error when the caller cannot read the protected %s",
    (protects) => {
      const error = thrown(() => assertFolderDeleteAllowed(protectedAt("/app/api", protects), canReadNothing));

      expect(error).toBeInstanceOf(BadRequestError);
      expect(error).toMatchObject({
        name: "DeleteFolderProtectedByPolicy",
        message:
          'You cannot delete the selected folder because it contains one or more resources that are protected by the change policy "prod-guard" at folder path "/app/api". Please remove the resources at folder path "/app/api" and try again.'
      });
    }
  );

  test("names the content only where the caller can read it", () => {
    const access = buildAccess([
      {
        action: ProjectPermissionActions.Read,
        subject: ProjectPermissionSub.SecretImports,
        conditions: { secretPath: { $glob: "/app/web/**" } }
      }
    ]);

    expect(thrown(() => assertFolderDeleteAllowed(protectedAt("/app/api", "secret_import"), access))).toMatchObject({
      name: "DeleteFolderProtectedByPolicy"
    });
    expect(thrown(() => assertFolderDeleteAllowed(protectedAt("/app/web", "secret_import"), access))).toMatchObject({
      name: "DeleteFolderImportProtectedByPolicy"
    });
  });

  test("allows a delete when nothing is protected", () => {
    expect(assertFolderDeleteAllowed(null, canReadNothing)).toBeUndefined();
  });
});

describe("assertFolderRenameAllowed", () => {
  test("refuses a rename when a change policy covers a secret in the tree", () => {
    const error = thrown(() => assertFolderRenameAllowed(protectedAt("/app/api", "secret"), "source", canReadAll));

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error).toMatchObject({
      name: "RenameFolderProtectedByPolicy",
      message:
        'You cannot rename the selected folder because it contains one or more secrets that are protected by the change policy "prod-guard" at folder path "/app/api". Please remove the secrets at folder path "/app/api" and try again.'
    });
  });

  test("refuses a rename when a change policy covers a secret import in the tree", () => {
    const error = thrown(() =>
      assertFolderRenameAllowed(protectedAt("/app/api", "secret_import"), "source", canReadAll)
    );

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error).toMatchObject({
      name: "RenameFolderImportProtectedByPolicy",
      message:
        'You cannot rename the selected folder because it contains one or more secret imports that are protected by the change policy "prod-guard" at folder path "/app/api". Please remove the secret imports at folder path "/app/api" and try again.'
    });
  });

  test.each(["secret", "secret_import"] as const)(
    "refuses with a generic error when the caller cannot read the protected %s",
    (protects) => {
      const error = thrown(() =>
        assertFolderRenameAllowed(protectedAt("/app/api", protects), "source", canReadNothing)
      );

      expect(error).toMatchObject({
        name: "RenameFolderProtectedByPolicy",
        message:
          'You cannot rename the selected folder because it contains one or more resources that are protected by the change policy "prod-guard" at folder path "/app/api". Please remove the resources at folder path "/app/api" and try again.'
      });
    }
  );

  test("refuses a rename that would move secrets under a protected path", () => {
    const error = thrown(() =>
      assertFolderRenameAllowed(protectedAt("/prod", "secret", "/staging"), "destination", canReadAll)
    );

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error).toMatchObject({
      name: "RenameFolderIntoProtectedPath",
      message:
        'You cannot rename the selected folder because its secrets would move to folder path "/prod", which is protected by the change policy "prod-guard". Choose a different name and try again.'
    });
  });

  test("refuses a rename that would move secret imports under a protected path", () => {
    const error = thrown(() =>
      assertFolderRenameAllowed(protectedAt("/prod/api", "secret_import", "/staging/api"), "destination", canReadAll)
    );

    expect(error).toMatchObject({
      name: "RenameFolderIntoProtectedPath",
      message:
        'You cannot rename the selected folder because its secret imports would move to folder path "/prod/api", which is protected by the change policy "prod-guard". Choose a different name and try again.'
    });
  });

  test("checks the caller's access where the content lives now, not at the destination", () => {
    const access = buildAccess([
      {
        action: ProjectPermissionSecretActions.DescribeSecret,
        subject: ProjectPermissionSub.Secrets,
        conditions: { secretPath: { $glob: "/staging/**" } }
      }
    ]);

    expect(() =>
      assertFolderRenameAllowed(protectedAt("/prod/api", "secret", "/staging/api"), "destination", access)
    ).toThrow("because its secrets would move");
    expect(() =>
      assertFolderRenameAllowed(protectedAt("/staging/api", "secret", "/prod/api"), "destination", access)
    ).toThrow("because its resources would move");
  });

  test("allows a rename when nothing is protected on either side", () => {
    expect(assertFolderRenameAllowed(null, "source", canReadNothing)).toBeUndefined();
    expect(assertFolderRenameAllowed(null, "destination", canReadNothing)).toBeUndefined();
  });
});

describe("assertNoOverlappingFolderEntries", () => {
  const entry = (path: string, environment: string = "dev") => ({ environment, path });

  test("allows siblings, prefix-named siblings, and the same path in other environments", () => {
    expect(() =>
      assertNoOverlappingFolderEntries([entry("/app/api"), entry("/app/web"), entry("/a"), entry("/ab")])
    ).not.toThrow();
    expect(() => assertNoOverlappingFolderEntries([entry("/app"), entry("/app", "prod")])).not.toThrow();
    expect(() => assertNoOverlappingFolderEntries([entry("/app"), entry("/app/api", "prod")])).not.toThrow();
  });

  test("refuses the same folder twice", () => {
    expect(() => assertNoOverlappingFolderEntries([entry("/app"), entry("/app")])).toThrow(BadRequestError);
  });

  test.each([
    ["parent first", ["/app", "/app/api/v1"]],
    ["child first", ["/app/api/v1", "/app"]]
  ])("refuses a folder together with one of its subfolders (%s)", (_, paths) => {
    const error = thrown(() => assertNoOverlappingFolderEntries(paths.map((path) => entry(path))));

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error).toMatchObject({
      name: "UpdateManyFolders",
      message:
        'Folder "/app/api/v1" overlaps with folder "/app" in environment "dev". A batch can include each folder only once and cannot include a folder together with its subfolders. Update them in separate requests.'
    });
  });
});

describe("resolveBatchFolderEntries", () => {
  const tx = {} as Knex;
  const appId = "11111111-1111-4111-8111-111111111111";

  const makeDeps = (pathById: Record<string, string>) => {
    const folders = [
      { id: appId, name: "app", parentId: "root-id" },
      { id: "api-id", name: "api", parentId: appId }
    ];
    const parentByPath: Record<string, { id: string; path: string }> = {
      "/": { id: "root-id", path: "/" },
      app: { id: appId, path: "app" },
      "/app": { id: appId, path: "/app" }
    };

    const findBySecretPath = vi.fn(
      async (_projectId: string, _env: string, secretPath: string) => parentByPath[secretPath]
    );
    const findOne = vi.fn(async (filter: { id?: string; name?: string; parentId: string }) =>
      folders.find(
        (folder) =>
          folder.parentId === filter.parentId && (filter.id ? folder.id === filter.id : folder.name === filter.name)
      )
    );
    const findSecretPathByFolderIds = vi.fn(async (_projectId: string, ids: string[]) =>
      ids.map((id) => (pathById[id] ? { path: pathById[id] } : undefined))
    );
    const findEnv = vi.fn(async () => ({ id: "env-1", slug: "dev" }));

    return {
      deps: {
        folderDAL: { findBySecretPath, findOne, findSecretPathByFolderIds } as unknown as Pick<
          TSecretFolderDALFactory,
          "findBySecretPath" | "findOne" | "findSecretPathByFolderIds"
        >,
        projectEnvDAL: { findOne: findEnv } as unknown as Pick<TProjectEnvDALFactory, "findOne">
      },
      findSecretPathByFolderIds
    };
  };

  const resolve = (
    folders: { environment: string; path: string; id: string; name: string }[],
    deps: ReturnType<typeof makeDeps>["deps"]
  ) => resolveBatchFolderEntries({ projectId: "project-1", folders }, deps, tx);

  test("returns each folder's path from the database, read once for the whole batch", async () => {
    const { deps, findSecretPathByFolderIds } = makeDeps({ "api-id": "/app/api" });

    const [entry] = await resolve([{ environment: "dev", path: "app", id: "api", name: "web" }], deps);

    expect(entry.folder).toMatchObject({ id: "api-id" });
    expect(entry.folderPath).toBe("/app/api");
    expect(findSecretPathByFolderIds).toHaveBeenCalledTimes(1);
    expect(findSecretPathByFolderIds).toHaveBeenCalledWith("project-1", ["api-id"], tx);
  });

  test("finds a folder by ID or by name", async () => {
    const { deps } = makeDeps({ [appId]: "/app" });

    const [byId] = await resolve([{ environment: "dev", path: "/", id: appId, name: "service" }], deps);
    const [byName] = await resolve([{ environment: "dev", path: "/", id: "app", name: "service" }], deps);

    expect(byId.folder).toMatchObject({ id: appId });
    expect(byName.folder).toMatchObject({ id: appId });
  });

  test("refuses the same folder sent once by ID and once by name", async () => {
    const { deps } = makeDeps({ [appId]: "/app" });

    await expect(
      resolve(
        [
          { environment: "dev", path: "/", id: appId, name: "service" },
          { environment: "dev", path: "/", id: "app", name: "service" }
        ],
        deps
      )
    ).rejects.toThrow('Folder "/app" overlaps with folder "/app"');
  });

  test("refuses a batch that renames a folder and one of its subfolders", async () => {
    const { deps } = makeDeps({ [appId]: "/app", "api-id": "/app/api" });

    await expect(
      resolve(
        [
          { environment: "dev", path: "/", id: appId, name: "service" },
          { environment: "dev", path: "/app", id: "api", name: "web" }
        ],
        deps
      )
    ).rejects.toThrow('Folder "/app/api" overlaps with folder "/app"');
  });

  test("refuses a folder that does not exist under the given path", async () => {
    const { deps } = makeDeps({});

    await expect(resolve([{ environment: "dev", path: "/app", id: "missing", name: "web" }], deps)).rejects.toThrow(
      "Folder with id 'missing' in environment with slug 'dev' not found"
    );
    await expect(resolve([{ environment: "dev", path: "/nope", id: "api", name: "web" }], deps)).rejects.toThrow(
      "Folder with path '/nope' in environment with slug 'dev' not found"
    );
  });
});
