// These rules mirror how the backend picks which syncs a secret change triggers (see
// queueSecretSyncsSyncSecretsByPath in backend/src/services/secret-sync/secret-sync-queue.ts).
// Change both together, or this warning stops matching what actually syncs.

type TCoverageSync = {
  environment?: { slug: string } | null;
  folder?: { path: string } | null;
  syncOptions?: { includeAllSubFolders?: boolean } | null;
};

export type TPathRef = { environment: string; secretPath: string };

// one item moved or copied from its source path to the path it lands at
export type TItemMove = { source: TPathRef; destination: TPathRef };

const toPathSegments = (path: string) => path.split("/").filter(Boolean);

// A sync on the path itself always covers it, whether or not it includes subfolders. A sync on an
// ancestor folder only covers it when it includes them. The path need not exist yet: a folder being
// moved has no folder at its landing path, and only the recursive syncs above it can cover it there.
export const isPathCoveredBySecretSync = (
  sync: TCoverageSync,
  { environment, secretPath }: TPathRef
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

const isSamePath = (a: string, b: string) =>
  toPathSegments(a).join("/") === toPathSegments(b).join("/");

const sortByName = <T extends { name: string }>(syncs: T[]) =>
  [...syncs].sort((a, b) => a.name.localeCompare(b.name));

// The syncs that would start sending items to their destination if they were moved or copied as described.
// A sync that already covers a move's source is left out for that move, since the items already reach it.
export const getSecretSyncsNewlyCoveringPaths = <
  T extends TCoverageSync & { id: string; name: string }
>(
  syncs: T[],
  moves: TItemMove[]
) =>
  sortByName(
    syncs.filter((sync) =>
      moves.some(
        (move) =>
          isPathCoveredBySecretSync(sync, move.destination) &&
          !isPathCoveredBySecretSync(sync, move.source)
      )
    )
  );

// The syncs a copy would give two secrets with the same name. A copy leaves the original in place, so
// copying between two folders of one sync puts both in it, and since a sync's key schema cannot include
// the folder, both map to one key in the destination and the sync fails on it. Two different folders can
// only share a sync that includes subfolders, so a sync without them never matches.
export const getSecretSyncsDuplicatedByCopies = <
  T extends TCoverageSync & { id: string; name: string }
>(
  syncs: T[],
  copies: TItemMove[]
) =>
  sortByName(
    syncs.filter((sync) =>
      copies.some(
        (copy) =>
          !(
            copy.source.environment === copy.destination.environment &&
            isSamePath(copy.source.secretPath, copy.destination.secretPath)
          ) &&
          isPathCoveredBySecretSync(sync, copy.source) &&
          isPathCoveredBySecretSync(sync, copy.destination)
      )
    )
  );
