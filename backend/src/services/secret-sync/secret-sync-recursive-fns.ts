import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { recursivelyGetSecretPaths } from "@app/services/secret-v2-bridge/secret-v2-bridge-fns";

export const SECRET_SYNC_MAX_SECRETS = 10_000;

export const assertWithinSecretLimit = (count: number) => {
  if (count <= SECRET_SYNC_MAX_SECRETS) return;

  throw new SecretSyncError({
    message: `This sync covers ${count} secrets, which is above the limit of ${SECRET_SYNC_MAX_SECRETS} for a single sync. Point the sync at a narrower secret path, or split it into several syncs.`,
    shouldRetry: false
  });
};

export const resolveSyncFolders = async ({
  folderDAL,
  projectEnvDAL,
  projectId,
  environment,
  sourcePath,
  sourceFolderId,
  recursive
}: {
  folderDAL: Pick<TSecretFolderDALFactory, "find">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  projectId: string;
  environment: string;
  sourcePath: string;
  sourceFolderId: string;
  recursive: boolean;
}): Promise<{ folderId: string; path: string }[]> => {
  if (!recursive) return [{ folderId: sourceFolderId, path: sourcePath }];

  const paths = await recursivelyGetSecretPaths({
    folderDAL,
    projectEnvDAL,
    projectId,
    environment,
    currentPath: sourcePath
  });

  if (!paths.length) {
    throw new SecretSyncError({
      message: `Could not find the folder "${sourcePath}" in environment "${environment}". Update the sync's source environment and secret path.`,
      shouldRetry: false
    });
  }

  return paths.map(({ folderId, path }) => ({ folderId, path }));
};
