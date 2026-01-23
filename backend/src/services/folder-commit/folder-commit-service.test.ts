/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/return-await */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Knex } from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TSecretFolderVersions } from "@app/db/schemas/secret-folder-versions";
import { TSecretVersionsV2 } from "@app/db/schemas/secret-versions-v2";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { ActorType } from "../auth/auth-type";
import {
  ChangeType,
  CommitType,
  folderCommitServiceFactory,
  ResourceChange,
  TFolderCommitServiceFactory
} from "./folder-commit-service";

// Mock config
vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({
    PIT_CHECKPOINT_WINDOW: 5,
    PIT_TREE_CHECKPOINT_WINDOW: 10
  })
}));

// Mock logger
vi.mock("@app/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe("folderCommitServiceFactory", () => {
  // Properly type the mock functions
  type TransactionCallback<T> = (trx: Knex) => Promise<T>;

  // Mock dependencies
  const mockFolderCommitDAL = {
    create: vi.fn().mockResolvedValue({}),
    findById: vi.fn().mockResolvedValue({}),
    findByFolderId: vi.fn().mockResolvedValue([]),
    findLatestCommit: vi.fn().mockResolvedValue({}),
    transaction: vi.fn().mockImplementation(<T>(callback: TransactionCallback<T>) => callback({} as Knex)),
    getNumberOfCommitsSince: vi.fn().mockResolvedValue(0),
    getEnvNumberOfCommitsSince: vi.fn().mockResolvedValue(0),
    findCommitsToRecreate: vi.fn().mockResolvedValue([]),
    findMultipleLatestCommits: vi.fn().mockResolvedValue([]),
    findLatestCommitBetween: vi.fn().mockResolvedValue({}),
    findAllCommitsBetween: vi.fn().mockResolvedValue([]),
    findLatestEnvCommit: vi.fn().mockResolvedValue({}),
    findLatestCommitByFolderIds: vi.fn().mockResolvedValue({})
  };

  const mockKmsService = {
    createCipherPairWithDataKey: vi.fn().mockResolvedValue({})
  };

  const mockFolderCommitChangesDAL = {
    create: vi.fn().mockResolvedValue({}),
    findByCommitId: vi.fn().mockResolvedValue([]),
    insertMany: vi.fn().mockResolvedValue([])
  };

  const mockFolderCheckpointDAL = {
    create: vi.fn().mockResolvedValue({}),
    findByFolderId: vi.fn().mockResolvedValue([]),
    findLatestByFolderId: vi.fn().mockResolvedValue(null),
    findNearestCheckpoint: vi.fn().mockResolvedValue({})
  };

  const mockFolderCheckpointResourcesDAL = {
    insertMany: vi.fn().mockResolvedValue([]),
    findByCheckpointId: vi.fn().mockResolvedValue([])
  };

  const mockFolderTreeCheckpointDAL = {
    create: vi.fn().mockResolvedValue({}),
    findByProjectId: vi.fn().mockResolvedValue([]),
    findLatestByProjectId: vi.fn().mockResolvedValue({}),
    findNearestCheckpoint: vi.fn().mockResolvedValue({}),
    findLatestByEnvId: vi.fn().mockResolvedValue({})
  };

  const mockFolderTreeCheckpointResourcesDAL = {
    insertMany: vi.fn().mockResolvedValue([]),
    findByTreeCheckpointId: vi.fn().mockResolvedValue([])
  };

  const mockUserDAL = {
    findById: vi.fn().mockResolvedValue({})
  };

  const mockIdentityDAL = {
    findById: vi.fn().mockResolvedValue({})
  };

  const mockFolderDAL = {
    findByParentId: vi.fn().mockResolvedValue([]),
    findByProjectId: vi.fn().mockResolvedValue([]),
    deleteById: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
    updateById: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    find: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue({}),
    findByEnvId: vi.fn().mockResolvedValue([]),
    findFoldersByRootAndIds: vi.fn().mockResolvedValue([])
  };

  const mockFolderVersionDAL = {
    findLatestFolderVersions: vi.fn().mockResolvedValue({}),
    findById: vi.fn().mockResolvedValue({}),
    deleteById: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
    updateById: vi.fn().mockResolvedValue({}),
    find: vi.fn().mockResolvedValue({}), // Changed from [] to {} to match Object.values() expectation
    findByIdsWithLatestVersion: vi.fn().mockResolvedValue({})
  };

  const mockSecretVersionV2BridgeDAL = {
    findLatestVersionByFolderId: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue({}),
    deleteById: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
    updateById: vi.fn().mockResolvedValue({}),
    find: vi.fn().mockResolvedValue([]),
    findByIdsWithLatestVersion: vi.fn().mockResolvedValue({}),
    findLatestVersionMany: vi.fn().mockResolvedValue({})
  };

  const mockSecretV2BridgeDAL = {
    deleteById: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
    updateById: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    insertMany: vi.fn().mockResolvedValue([]),
    invalidateSecretCacheByProjectId: vi.fn().mockResolvedValue({})
  };

  const mockProjectDAL = {
    findById: vi.fn().mockResolvedValue({}),
    findProjectByEnvId: vi.fn().mockResolvedValue({})
  };

  const mockFolderCommitQueueService = {
    scheduleTreeCheckpoint: vi.fn().mockResolvedValue({}),
    createFolderTreeCheckpoint: vi.fn().mockResolvedValue({})
  };

  const mockPermissionService = {
    getProjectPermission: vi.fn().mockResolvedValue({})
  };

  const mockSecretTagDAL = {
    findSecretTagsByVersionId: vi.fn().mockResolvedValue([]),
    saveTagsToSecretV2: vi.fn().mockResolvedValue([]),
    findSecretTagsBySecretId: vi.fn().mockResolvedValue([]),
    deleteTagsToSecretV2: vi.fn().mockResolvedValue([]),
    saveTagsToSecretVersionV2: vi.fn().mockResolvedValue([])
  };

  const mockResourceMetadataDAL = {
    find: vi.fn().mockResolvedValue([]),
    insertMany: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue([])
  };

  let folderCommitService: TFolderCommitServiceFactory;

  beforeEach(() => {
    vi.clearAllMocks();

    folderCommitService = folderCommitServiceFactory({
      // @ts-expect-error - Mock implementation doesn't need all interface methods for testing
      folderCommitDAL: mockFolderCommitDAL,
      // @ts-expect-error - Mock implementation doesn't need all interface methods for testing
      folderCommitChangesDAL: mockFolderCommitChangesDAL,
      // @ts-expect-error - Mock implementation doesn't need all interface methods for testing
      folderCheckpointDAL: mockFolderCheckpointDAL,
      // @ts-expect-error - Mock implementation doesn't need all interface methods for testing
      folderCheckpointResourcesDAL: mockFolderCheckpointResourcesDAL,
      // @ts-expect-error - Mock implementation doesn't need all interface methods for testing
      folderTreeCheckpointDAL: mockFolderTreeCheckpointDAL,
      // @ts-expect-error - Mock implementation doesn't need all interface methods for testing
      folderTreeCheckpointResourcesDAL: mockFolderTreeCheckpointResourcesDAL,
      // @ts-expect-error - Mock implementation doesn't need all interface methods for testing
      userDAL: mockUserDAL,
      // @ts-expect-error - Mock implementation doesn't need all interface methods for testing
      identityDAL: mockIdentityDAL,
      // @ts-expect-error - Mock implementation doesn't need all interface methods for testing
      folderDAL: mockFolderDAL,
      // @ts-expect-error - Mock implementation doesn't need all interface methods for testing
      folderVersionDAL: mockFolderVersionDAL,
      // @ts-expect-error - Mock implementation doesn't need all interface methods for testing
      secretVersionV2BridgeDAL: mockSecretVersionV2BridgeDAL,
      projectDAL: mockProjectDAL,
      // @ts-expect-error - Mock implementation doesn't need all interface methods for testing
      secretV2BridgeDAL: mockSecretV2BridgeDAL,
      folderCommitQueueService: mockFolderCommitQueueService,
      // @ts-expect-error - Mock implementation doesn't need all interface methods for testing
      permissionService: mockPermissionService,
      kmsService: mockKmsService,
      secretTagDAL: mockSecretTagDAL,
      resourceMetadataDAL: mockResourceMetadataDAL
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("createCommit", () => {
    it("should successfully create a commit with user actor", async () => {
      // Arrange
      const userData = { id: "user-id", username: "testuser" };
      const folderData = { id: "folder-id", envId: "env-id" };
      const commitData = { id: "commit-id", folderId: "folder-id" };

      mockUserDAL.findById.mockResolvedValue(userData);
      mockFolderDAL.findById.mockResolvedValue(folderData);
      mockFolderCommitDAL.create.mockResolvedValue(commitData);
      mockFolderCheckpointDAL.findLatestByFolderId.mockResolvedValue(null);
      mockFolderCommitDAL.findLatestCommit.mockResolvedValue({ id: "latest-commit-id" });
      mockFolderDAL.findByParentId.mockResolvedValue([]);
      mockSecretVersionV2BridgeDAL.findLatestVersionByFolderId.mockResolvedValue([]);

      const data = {
        actor: {
          type: ActorType.USER,
          metadata: { id: userData.id }
        },
        message: "Test commit",
        folderId: folderData.id,
        changes: [
          {
            type: CommitType.ADD,
            secretVersionId: "secret-version-1"
          }
        ]
      };

      // Act
      const result = await folderCommitService.createCommit(data);

      // Assert
      expect(mockUserDAL.findById).toHaveBeenCalledWith(userData.id, undefined);
      expect(mockFolderDAL.findById).toHaveBeenCalledWith(folderData.id, undefined);
      expect(mockFolderCommitDAL.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actorType: ActorType.USER,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          actorMetadata: expect.objectContaining({ name: userData.username }),
          message: data.message,
          folderId: data.folderId,
          envId: folderData.envId
        }),
        undefined
      );
      expect(mockFolderCommitChangesDAL.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            folderCommitId: commitData.id,
            changeType: data.changes[0].type,
            secretVersionId: data.changes[0].secretVersionId
          })
        ]),
        undefined
      );
      expect(mockFolderCommitQueueService.scheduleTreeCheckpoint).toHaveBeenCalledWith(folderData.envId);
      expect(result).toEqual(commitData);
    });

    it("should successfully create a commit with identity actor", async () => {
      // Arrange
      const identityData = { id: "identity-id", name: "testidentity" };
      const folderData = { id: "folder-id", envId: "env-id" };
      const commitData = { id: "commit-id", folderId: "folder-id" };

      mockIdentityDAL.findById.mockResolvedValue(identityData);
      mockFolderDAL.findById.mockResolvedValue(folderData);
      mockFolderCommitDAL.create.mockResolvedValue(commitData);
      mockFolderCheckpointDAL.findLatestByFolderId.mockResolvedValue(null);
      mockFolderCommitDAL.findLatestCommit.mockResolvedValue({ id: "latest-commit-id" });
      mockFolderDAL.findByParentId.mockResolvedValue([]);
      mockSecretVersionV2BridgeDAL.findLatestVersionByFolderId.mockResolvedValue([]);

      // Mock folderVersionDAL.find to return an object with folder version data
      mockFolderVersionDAL.find.mockResolvedValue({
        "folder-version-1": {
          id: "folder-version-1",
          folderId: "sub-folder-id",
          envId: "env-id",
          name: "Test Folder",
          version: 1
        }
      });

      const data = {
        actor: {
          type: ActorType.IDENTITY,
          metadata: { id: identityData.id }
        },
        message: "Test commit",
        folderId: folderData.id,
        changes: [
          {
            type: CommitType.ADD,
            folderVersionId: "folder-version-1"
          }
        ],
        omitIgnoreFilter: true
      };

      // Act
      const result = await folderCommitService.createCommit(data);

      // Assert
      expect(mockIdentityDAL.findById).toHaveBeenCalledWith(identityData.id, undefined);
      expect(mockFolderDAL.findById).toHaveBeenCalledWith(folderData.id, undefined);
      expect(mockFolderCommitDAL.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actorType: ActorType.IDENTITY,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          actorMetadata: expect.objectContaining({ name: identityData.name }),
          message: data.message,
          folderId: data.folderId,
          envId: folderData.envId
        }),
        undefined
      );
      expect(mockFolderCommitChangesDAL.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            folderCommitId: commitData.id,
            changeType: data.changes[0].type,
            folderVersionId: data.changes[0].folderVersionId
          })
        ]),
        undefined
      );
      expect(mockFolderCommitQueueService.scheduleTreeCheckpoint).toHaveBeenCalledWith(folderData.envId);
      expect(result).toEqual(commitData);
    });

    it("should throw NotFoundError when folder does not exist", async () => {
      // Arrange
      mockFolderDAL.findById.mockResolvedValue(null);

      const data = {
        actor: {
          type: ActorType.PLATFORM
        },
        message: "Test commit",
        folderId: "non-existent-folder",
        changes: []
      };

      // Act & Assert
      await expect(folderCommitService.createCommit(data)).rejects.toThrow(NotFoundError);
      expect(mockFolderDAL.findById).toHaveBeenCalledWith("non-existent-folder", undefined);
    });
  });

  describe("addCommitChange", () => {
    it("should successfully add a change to an existing commit", async () => {
      // Arrange
      const commitData = { id: "commit-id", folderId: "folder-id" };
      const changeData = { id: "change-id", folderCommitId: "commit-id" };

      mockFolderCommitDAL.findById.mockResolvedValue(commitData);
      mockFolderCommitChangesDAL.create.mockResolvedValue(changeData);

      const data = {
        folderCommitId: commitData.id,
        changeType: CommitType.ADD,
        secretVersionId: "secret-version-1"
      };

      // Act
      const result = await folderCommitService.addCommitChange(data);

      // Assert
      expect(mockFolderCommitDAL.findById).toHaveBeenCalledWith(commitData.id, undefined);
      expect(mockFolderCommitChangesDAL.create).toHaveBeenCalledWith(data, undefined);
      expect(result).toEqual(changeData);
    });

    it("should throw BadRequestError when neither secretVersionId nor folderVersionId is provided", async () => {
      // Arrange
      const data = {
        folderCommitId: "commit-id",
        changeType: CommitType.ADD
      };

      // Act & Assert
      await expect(folderCommitService.addCommitChange(data)).rejects.toThrow(BadRequestError);
    });

    it("should throw NotFoundError when commit does not exist", async () => {
      // Arrange
      mockFolderCommitDAL.findById.mockResolvedValue(null);

      const data = {
        folderCommitId: "non-existent-commit",
        changeType: CommitType.ADD,
        secretVersionId: "secret-version-1"
      };

      // Act & Assert
      await expect(folderCommitService.addCommitChange(data)).rejects.toThrow(NotFoundError);
      expect(mockFolderCommitDAL.findById).toHaveBeenCalledWith("non-existent-commit", undefined);
    });
  });

  // Note: reconstructFolderState is an internal function not exposed in the public API
  // We'll test it indirectly through compareFolderStates

  describe("compareFolderStates", () => {
    it("should mark all resources as creates when currentCommitId is not provided", async () => {
      // Arrange
      const targetCommitId = "target-commit-id";
      const targetCommit = { id: targetCommitId, commitId: 1, folderId: "folder-id" };

      mockFolderCommitDAL.findById.mockResolvedValue(targetCommit);
      // Mock how compareFolderStates would process the results internally
      mockFolderCheckpointDAL.findNearestCheckpoint.mockResolvedValue({ id: "checkpoint-id", commitId: "hash-0" });
      mockFolderCheckpointResourcesDAL.findByCheckpointId.mockResolvedValue([
        { secretVersionId: "secret-version-1", referencedSecretId: "secret-1" },
        { folderVersionId: "folder-version-1", referencedFolderId: "folder-1" }
      ]);
      mockFolderCommitDAL.findCommitsToRecreate.mockResolvedValue([]);
      mockProjectDAL.findProjectByEnvId.mockResolvedValue({
        id: "project-id",
        name: "test-project"
      });

      // Act
      const result = await folderCommitService.compareFolderStates({
        targetCommitId
      });

      // Assert
      expect(mockFolderCommitDAL.findById).toHaveBeenCalledWith(targetCommitId, undefined);

      // Verify we get resources marked as create
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            changeType: "create",
            commitId: targetCommit.commitId
          })
        ])
      );
    });
  });

  describe("createFolderCheckpoint", () => {
    it("should successfully create a checkpoint when force is true", async () => {
      // Arrange
      const folderCommitId = "commit-id";
      const folderId = "folder-id";
      const checkpointData = { id: "checkpoint-id", folderCommitId };

      mockFolderDAL.findByParentId.mockResolvedValue([{ id: "subfolder-id" }]);
      mockFolderVersionDAL.findLatestFolderVersions.mockResolvedValue({ "subfolder-id": { id: "folder-version-1" } });
      mockSecretVersionV2BridgeDAL.findLatestVersionByFolderId.mockResolvedValue([{ id: "secret-version-1" }]);
      mockFolderCheckpointDAL.create.mockResolvedValue(checkpointData);

      // Act
      const result = await folderCommitService.createFolderCheckpoint({
        folderId,
        folderCommitId,
        force: true
      });

      // Assert
      expect(mockFolderCheckpointDAL.create).toHaveBeenCalledWith({ folderCommitId }, undefined);
      expect(mockFolderCheckpointResourcesDAL.insertMany).toHaveBeenCalled();
      expect(result).toBe(folderCommitId);
    });
  });

  describe("deepRollbackFolder", () => {
    it("should throw NotFoundError when commit doesn't exist", async () => {
      // Arrange
      const targetCommitId = "non-existent-commit";
      const envId = "env-id";
      const actorId = "user-id";
      const actorType = ActorType.USER;
      const projectId = "project-id";

      // Mock the transaction to properly handle the error
      mockFolderCommitDAL.transaction.mockImplementation(async (callback) => {
        return await callback({} as Knex);
      });

      // Mock findById to return null inside the transaction
      mockFolderCommitDAL.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        folderCommitService.deepRollbackFolder(targetCommitId, envId, actorId, actorType, projectId)
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe("createFolderTreeCheckpoint", () => {
    it("should create a tree checkpoint when checkpoint window is exceeded", async () => {
      // Arrange
      const envId = "env-id";
      const folderCommitId = "commit-id";
      const latestCommit = { id: folderCommitId };
      const latestTreeCheckpoint = { id: "tree-checkpoint-id", folderCommitId: "old-commit-id" };
      const folders = [
        { id: "folder-1", isReserved: false },
        { id: "folder-2", isReserved: false },
        { id: "folder-3", isReserved: true } // Reserved folders should be filtered out
      ];
      const folderCommits = [
        { folderId: "folder-1", id: "commit-1" },
        { folderId: "folder-2", id: "commit-2" }
      ];
      const treeCheckpoint = { id: "new-tree-checkpoint-id" };

      mockFolderCommitDAL.findLatestEnvCommit.mockResolvedValue(latestCommit);
      mockFolderTreeCheckpointDAL.findLatestByEnvId.mockResolvedValue(latestTreeCheckpoint);
      mockFolderCommitDAL.getEnvNumberOfCommitsSince.mockResolvedValue(15); // More than PIT_TREE_CHECKPOINT_WINDOW (10)
      mockFolderDAL.findByEnvId.mockResolvedValue(folders);
      mockFolderCommitDAL.findMultipleLatestCommits.mockResolvedValue(folderCommits);
      mockFolderTreeCheckpointDAL.create.mockResolvedValue(treeCheckpoint);

      // Act
      await folderCommitService.createFolderTreeCheckpoint(envId);

      // Assert
      expect(mockFolderCommitDAL.findLatestEnvCommit).toHaveBeenCalledWith(envId, undefined);
      expect(mockFolderTreeCheckpointDAL.create).toHaveBeenCalledWith({ folderCommitId }, undefined);
    });
  });

  describe("applyFolderStateDifferences", () => {
    it("should process changes correctly", async () => {
      // Arrange
      const folderId = "folder-id";
      const projectId = "project-id";
      const actorId = "user-id";
      const actorType = ActorType.USER;

      const differences = [
        {
          id: "secret-1",
          versionId: "v1",
          changeType: ChangeType.CREATE,
          commitId: BigInt(1)
        } as ResourceChange,
        {
          id: "folder-1",
          versionId: "v2",
          changeType: ChangeType.UPDATE,
          commitId: BigInt(1),
          folderName: "Test Folder",
          folderVersion: "v2"
        } as ResourceChange
      ];

      const secretVersions = {
        "secret-1": {
          id: "secret-version-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          type: "shared",
          folderId: "folder-1",
          secretId: "secret-1",
          version: 1,
          key: "SECRET_KEY",
          encryptedValue: Buffer.from("encrypted"),
          encryptedComment: Buffer.from("comment"),
          skipMultilineEncoding: false,
          userId: "user-1",
          envId: "env-1",
          metadata: {}
        } as TSecretVersionsV2
      };

      const folderVersions = {
        "folder-1": {
          folderId: "folder-1",
          version: 1,
          name: "Test Folder",
          envId: "env-1"
        } as TSecretFolderVersions
      };

      // Mock folder lookup for the folder being processed
      mockFolderDAL.findById.mockImplementation((id) => {
        if (id === folderId) {
          return Promise.resolve({ id: folderId, envId: "env-1" });
        }
        return Promise.resolve(null);
      });

      // Mock latest commit lookup
      mockFolderCommitDAL.findLatestCommit.mockImplementation((id) => {
        if (id === folderId) {
          return Promise.resolve({ id: "latest-commit-id", folderId });
        }
        return Promise.resolve(null);
      });

      // Make sure findByParentId returns an array, not undefined
      mockFolderDAL.findByParentId.mockResolvedValue([]);

      // Make sure other required functions return appropriate values
      mockFolderCheckpointDAL.findLatestByFolderId.mockResolvedValue(null);
      mockSecretVersionV2BridgeDAL.findLatestVersionByFolderId.mockResolvedValue([]);

      // These mocks need to return objects with an id field
      mockSecretVersionV2BridgeDAL.findByIdsWithLatestVersion.mockResolvedValue(Object.values(secretVersions));
      mockFolderVersionDAL.findByIdsWithLatestVersion.mockResolvedValue(Object.values(folderVersions));
      mockSecretV2BridgeDAL.insertMany.mockResolvedValue([{ id: "new-secret-1" }]);
      mockSecretVersionV2BridgeDAL.create.mockResolvedValue({ id: "new-secret-version-1" });
      mockFolderDAL.updateById.mockResolvedValue({ id: "updated-folder-1" });
      mockFolderVersionDAL.create.mockResolvedValue({ id: "new-folder-version-1" });
      mockFolderCommitDAL.create.mockResolvedValue({ id: "new-commit-id" });
      mockSecretVersionV2BridgeDAL.findLatestVersionMany.mockResolvedValue([
        {
          id: "secret-version-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          type: "shared",
          folderId: "folder-1",
          secretId: "secret-1",
          version: 1,
          key: "SECRET_KEY",
          encryptedValue: Buffer.from("encrypted"),
          encryptedComment: Buffer.from("comment"),
          skipMultilineEncoding: false,
          userId: "user-1",
          envId: "env-1",
          metadata: {}
        }
      ]);

      // Mock transaction
      mockFolderCommitDAL.transaction.mockImplementation(<T>(callback: TransactionCallback<T>) => callback({} as Knex));

      // Act
      const result = await folderCommitService.applyFolderStateDifferences({
        differences,
        actorInfo: {
          actorType,
          actorId,
          message: "Applying changes"
        },
        folderId,
        projectId,
        reconstructNewFolders: false
      });

      // Assert
      expect(mockFolderCommitDAL.create).toHaveBeenCalled();
      expect(mockSecretV2BridgeDAL.invalidateSecretCacheByProjectId).toHaveBeenCalledWith(projectId, {});

      // Check that we got the right counts
      expect(result.totalChanges).toEqual(2);
    });
  });
});
