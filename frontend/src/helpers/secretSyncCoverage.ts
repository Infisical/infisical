// These rules mirror how the backend picks which syncs a secret change triggers (see
// queueSecretSyncsSyncSecretsByPath in backend/src/services/secret-sync/secret-sync-queue.ts).
// Change both together, or this warning stops matching what actually syncs.

type TCoverageSync = {
  environment?: { slug: string } | null;
  folder?: { path: string } | null;
  syncOptions?: { includeAllSubFolders?: boolean } | null;
};

export type TMoveWarningsCheck = {
  sourceEnvironment: string;
  sourceSecretPath: string;
  destinationEnvironment: string;
  destinationSecretPath: string;
};

const toPathSegments = (path: string) => path.split("/").filter(Boolean);

// A sync on the path itself always covers it, whether or not it includes subfolders. A sync on an
// ancestor folder only covers it when it includes them. The path need not exist yet: a folder being
// moved has no folder at its landing path, and only the recursive syncs above it can cover it there.
export const isPathCoveredBySecretSync = (
  sync: TCoverageSync,
  { environment, secretPath }: { environment: string; secretPath: string }
) => {
  if (!sync.folder || sync.environment?.slug !== environment) return false;

  const syncSegments = toPathSegments(sync.folder.path);
  const pathSegments = toPathSegments(secretPath);

  if (syncSegments.length > pathSegments.length) return false;
  if (syncSegments.some((segment, index) => segment !== pathSegments[index])) return false;

  return (
    syncSegments.length === pathSegments.length || Boolean(sync.syncOptions?.includeAllSubFolders)
  );
};

// A move or copy can land items anywhere beneath its destination, so a sync rooted below the destination
// counts as well as one covering it. This can warn about a sync that nothing ends up under, which is
// safer for a warning than missing one.
export const isPathOrDescendantCoveredBySecretSync = (
  sync: TCoverageSync,
  { environment, secretPath }: { environment: string; secretPath: string }
) => {
  if (isPathCoveredBySecretSync(sync, { environment, secretPath })) return true;
  if (!sync.folder || sync.environment?.slug !== environment) return false;

  const syncSegments = toPathSegments(sync.folder.path);
  const pathSegments = toPathSegments(secretPath);

  return pathSegments.every((segment, index) => syncSegments[index] === segment);
};

// The syncs that would start sending items to their destination if they were moved or copied as the checks
// describe. A sync that already covers a check's source is left out for that check, since the items
// already reach it.
export const getSecretSyncsNewlyCoveringPaths = <
  T extends TCoverageSync & { id: string; name: string }
>(
  syncs: T[],
  checks: TMoveWarningsCheck[]
) =>
  syncs
    .filter((sync) =>
      checks.some(
        (check) =>
          isPathOrDescendantCoveredBySecretSync(sync, {
            environment: check.destinationEnvironment,
            secretPath: check.destinationSecretPath
          }) &&
          !isPathCoveredBySecretSync(sync, {
            environment: check.sourceEnvironment,
            secretPath: check.sourceSecretPath
          })
      )
    )
    .sort((a, b) => a.name.localeCompare(b.name));
