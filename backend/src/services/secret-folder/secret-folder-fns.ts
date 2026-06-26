import { MongoAbility, subject } from "@casl/ability";
import { Knex } from "knex";

import { TSecretFolders } from "@app/db/schemas";
import { TDynamicSecretDALFactory } from "@app/ee/services/dynamic-secret/dynamic-secret-dal";
import { THoneyTokenDALFactory } from "@app/ee/services/honey-token/honey-token-dal";
import {
  ProjectPermissionActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionHoneyTokenActions,
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TSecretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { TSecretRotationV2DALFactory } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-dal";
import { BadRequestError, InternalServerError } from "@app/lib/errors";

import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { TFolderMoveBlockingType } from "./secret-folder-types";

export const buildFolderPath = (
  folder: TSecretFolders,
  foldersMap: Record<string, TSecretFolders>,
  depth: number = 0
): string => {
  if (depth > 20) {
    throw new InternalServerError({ message: "Maximum folder depth of 20 exceeded" });
  }
  if (!folder.parentId) {
    return depth === 0 ? "/" : "";
  }

  const parent = foldersMap[folder.parentId];
  if (!parent) {
    // Orphaned folder
    return `/${folder.name}`;
  }

  return `${buildFolderPath(parent, foldersMap, depth + 1)}/${folder.name}`;
};

export const buildFolderIdMap = (folders: TSecretFolders[]): Record<string, TSecretFolders> => {
  const map: Record<string, TSecretFolders> = {};
  for (const folder of folders) {
    map[folder.id] = folder;
  }
  return map;
};

export const buildChildrenMap = (folders: TSecretFolders[]): Record<string, TSecretFolders[]> => {
  const map: Record<string, TSecretFolders[]> = {};
  for (const folder of folders) {
    const key = folder.parentId || "null";
    if (!map[key]) {
      map[key] = [];
    }
    map[key].push(folder);
  }
  return map;
};

export const resolvePathToFolder = (
  childrenMap: Record<string, TSecretFolders[]>,
  pathSegments: string[]
): TSecretFolders | undefined => {
  const roots = childrenMap.null || [];
  const root = roots[0];
  if (!root) return undefined;

  if (pathSegments.length === 0) return root;

  let current = root;
  for (const segment of pathSegments) {
    const children = childrenMap[current.id] || [];
    const next = children.find((f) => f.name === segment);
    if (!next) return undefined;
    current = next;
  }
  return current;
};

export const resolveClosestFolder = (
  childrenMap: Record<string, TSecretFolders[]>,
  pathSegments: string[]
): TSecretFolders | undefined => {
  const roots = childrenMap.null || [];
  const root = roots[0];
  if (!root) return undefined;

  if (pathSegments.length === 0) return root;

  let current = root;
  for (const segment of pathSegments) {
    const children = childrenMap[current.id] || [];
    const next = children.find((f) => f.name === segment);
    if (!next) return current;
    current = next;
  }
  return current;
};

// read permission used to decide whether an actor is allowed to learn that a given blocking resource
// exists at a folder path. used to avoid disclosing subtree contents (e.g. honey tokens) to actors
// without access while still scanning the full subtree to enforce move correctness.
const FOLDER_MOVE_BLOCK_PERMISSION: Record<TFolderMoveBlockingType, { action: string; subject: ProjectPermissionSub }> =
  {
    secret_import: { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.SecretImports },
    dynamic_secret: {
      action: ProjectPermissionDynamicSecretActions.ReadRootCredential,
      subject: ProjectPermissionSub.DynamicSecrets
    },
    honey_token: { action: ProjectPermissionHoneyTokenActions.Read, subject: ProjectPermissionSub.HoneyTokens },
    secret_rotation: {
      action: ProjectPermissionSecretRotationActions.Read,
      subject: ProjectPermissionSub.SecretRotation
    },
    secret_approval_policy: { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.SecretFolders }
  };

// when set, the move-block scan only reports blocks at paths the actor is allowed to read, so it cannot
// disclose the existence of blocking resources in a subtree the actor cannot see (used by the read-only
// eligibility endpoint). the move itself omits this so a block always prevents the move.
export type TFolderMoveAccessScope = {
  permission: MongoAbility<ProjectPermissionSet>;
  environment: string;
  rootFolderPath: string;
};

export type TFolderMoveBlock = {
  blockingType: TFolderMoveBlockingType;
  // display path shown in error messages: relative to the moved folder for secret-type blocks, absolute
  // for approval-policy blocks (preserves the original message wording).
  blockingPath: string;
  // always absolute; used to gate whether the actor may learn the block exists.
  blockingAbsPath: string;
  policyName?: string;
};

export const canActorReadBlock = (
  permission: MongoAbility<ProjectPermissionSet>,
  environment: string,
  blockingType: TFolderMoveBlockingType,
  secretPath: string
) => {
  const { action, subject: sub } = FOLDER_MOVE_BLOCK_PERMISSION[blockingType];
  return (permission as MongoAbility).can(action, subject(sub, { environment, secretPath }));
};

// absolute path of a subtree folder, re-rooted at `rootFolderPath`; the moved folder itself is "/". when the
// root is "/", its prefix is dropped so child paths stay "/child" rather than "//child".
const buildToAbsPath = (rootFolderPath: string) => (folderPath: string) => {
  if (folderPath === "/") return rootFolderPath;
  const prefix = rootFolderPath === "/" ? "" : rootFolderPath;
  return `${prefix}${folderPath}`;
};

type TCheckFolderMoveBlockDeps = {
  secretImportDAL: Pick<TSecretImportDALFactory, "findImportByFolderIds">;
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "find">;
  honeyTokenDAL: Pick<THoneyTokenDALFactory, "find">;
  secretRotationV2DAL: Pick<TSecretRotationV2DALFactory, "existsByFolderIds">;
};

// scans the full subtree for non-static-secret resources (imports, dynamic secrets, honey tokens, rotations)
// and returns the first one found (or null). only the source subtree contents are scanned (the destination
// inherits the same contents). pass `accessScope` to limit reporting to paths the actor may read; omit it (the
// move path) to always detect a block and gate only the resulting message.
export const checkFolderMoveBlock = async (
  {
    subtree,
    rootFolderPath,
    accessScope
  }: {
    subtree: { id: string; path: string }[];
    rootFolderPath: string;
    accessScope?: TFolderMoveAccessScope;
  },
  { secretImportDAL, dynamicSecretDAL, honeyTokenDAL, secretRotationV2DAL }: TCheckFolderMoveBlockDeps,
  tx: Knex
): Promise<TFolderMoveBlock | null> => {
  const toAbsPath = buildToAbsPath(rootFolderPath);

  const folderIds = subtree.map((f) => f.id);
  if (!folderIds.length) return null;

  const pathByFolderId = new Map(subtree.map((f) => [f.id, f.path]));
  const resolvePath = (folderId: string) => pathByFolderId.get(folderId) ?? rootFolderPath;

  const buildBlock = (blockingType: TFolderMoveBlockingType, folderId: string): TFolderMoveBlock => {
    const blockingPath = resolvePath(folderId);

    return { blockingType, blockingPath, blockingAbsPath: toAbsPath(blockingPath) };
  };

  // when scoped, only scan folders whose absolute path the actor may read, so block presence at
  // inaccessible paths isn't disclosed.
  const folderIdsForType = (blockingType: TFolderMoveBlockingType) => {
    if (!accessScope) return folderIds;
    return folderIds.filter((folderId) =>
      canActorReadBlock(accessScope.permission, accessScope.environment, blockingType, toAbsPath(resolvePath(folderId)))
    );
  };

  const importFolderIds = folderIdsForType("secret_import");
  if (importFolderIds.length) {
    const importExists = await secretImportDAL.findImportByFolderIds(importFolderIds, tx);
    if (importExists) return buildBlock("secret_import", importExists.folderId);
  }

  const dynamicFolderIds = folderIdsForType("dynamic_secret");
  if (dynamicFolderIds.length) {
    const [dynamicSecret] = await dynamicSecretDAL.find({ $in: { folderId: dynamicFolderIds } }, { limit: 1, tx });
    if (dynamicSecret) return buildBlock("dynamic_secret", dynamicSecret.folderId);
  }

  const honeyTokenFolderIds = folderIdsForType("honey_token");
  if (honeyTokenFolderIds.length) {
    const [honeyToken] = await honeyTokenDAL.find({ $in: { folderId: honeyTokenFolderIds } }, { limit: 1, tx });
    if (honeyToken) return buildBlock("honey_token", honeyToken.folderId);
  }

  const rotationFolderIds = folderIdsForType("secret_rotation");
  if (rotationFolderIds.length) {
    const rotation = await secretRotationV2DAL.existsByFolderIds(rotationFolderIds, tx);
    if (rotation) return buildBlock("secret_rotation", rotation.folderId);
  }

  return null;
};

type TCheckFolderMovePolicyBlockDeps = {
  secretApprovalPolicyService: Pick<TSecretApprovalPolicyServiceFactory, "getSecretApprovalPolicyByPaths">;
};

// checks whether any folder in the subtree (re-rooted at `rootFolderPath` in `environment`) is governed by a
// secret approval policy, returning the first blocked path in subtree order (or null). used for both the source
// paths and the destination paths of a move. pass `accessScope` to limit reporting to paths the actor may read;
// omit it (the move path) to always detect a block and gate only the resulting message.
export const checkFolderMovePolicyBlock = async (
  {
    subtree,
    projectId,
    environment,
    rootFolderPath,
    accessScope
  }: {
    subtree: { id: string; path: string }[];
    projectId: string;
    environment: string;
    rootFolderPath: string;
    accessScope?: TFolderMoveAccessScope;
  },
  { secretApprovalPolicyService }: TCheckFolderMovePolicyBlockDeps
): Promise<TFolderMoveBlock | null> => {
  const toAbsPath = buildToAbsPath(rootFolderPath);

  let subtreeAbsPaths = subtree.map((f) => toAbsPath(f.path));
  // only consider paths the actor is allowed to read, so policy presence at inaccessible paths isn't disclosed.
  if (accessScope) {
    subtreeAbsPaths = subtreeAbsPaths.filter((secretPath) =>
      canActorReadBlock(accessScope.permission, accessScope.environment, "secret_approval_policy", secretPath)
    );
  }

  const policyByPath = await secretApprovalPolicyService.getSecretApprovalPolicyByPaths(
    projectId,
    environment,
    subtreeAbsPaths
  );

  // report the first blocked path in subtree order, matching the previous per-folder behavior.
  for (const blockedPath of subtreeAbsPaths) {
    const policy = policyByPath.get(blockedPath);
    if (policy) {
      return {
        blockingType: "secret_approval_policy",
        blockingPath: blockedPath,
        blockingAbsPath: blockedPath,
        policyName: policy.name
      };
    }
  }

  return null;
};

// throws the appropriate BadRequestError for a detected move block. the full subtree is always scanned to
// enforce correctness, but the message only reveals the offending path/type when the actor is allowed to read
// it; otherwise it stays generic so inaccessible subtree contents aren't disclosed.
export const assertFolderMoveAllowed = (
  block: TFolderMoveBlock,
  {
    permission,
    environment,
    folderName,
    scope
  }: {
    permission: MongoAbility<ProjectPermissionSet>;
    environment: string;
    folderName: string;
    scope: "source" | "destination";
  }
): never => {
  const canRead = canActorReadBlock(permission, environment, block.blockingType, block.blockingAbsPath);

  if (block.blockingType === "secret_approval_policy") {
    if (canRead && scope === "source") {
      throw new BadRequestError({
        message: `Cannot move folder '${folderName}'. The folder at path '${block.blockingPath}' is protected by the secret approval policy '${block.policyName}'. Folders governed by a secret approval policy cannot be moved. If you need to move this folder, please disable the secret approval policy for the path '${block.blockingPath}'`,
        name: "MoveFolderProtectedByPolicy"
      });
    }
    if (canRead) {
      throw new BadRequestError({
        message: `Cannot move folder '${folderName}'. The destination path '${block.blockingPath}' is protected by the secret approval policy '${block.policyName}'. Folders cannot be moved into a path governed by a secret approval policy. If you need to move this folder here, please disable the secret approval policy for the path '${block.blockingPath}'`,
        name: "MoveFolderProtectedByPolicy"
      });
    }
    if (scope === "source") {
      throw new BadRequestError({
        message: `Cannot move folder '${folderName}'. It contains resources that cannot be moved. Only folders that contain exclusively static secrets can be moved.`
      });
    }
    throw new BadRequestError({
      message: `Cannot move folder '${folderName}'. The destination is protected by a secret approval policy and the folder cannot be moved there.`
    });
  }

  if (canRead) {
    throw new BadRequestError({
      message: `Cannot move folder '${folderName}'. It contains a ${block.blockingType.replace(
        "_",
        " "
      )} at path '${block.blockingPath}'. Only folders that contain exclusively static secrets can be moved.`
    });
  }
  throw new BadRequestError({
    message: `Cannot move folder '${folderName}'. It contains resources that cannot be moved. Only folders that contain exclusively static secrets can be moved.`
  });
};
