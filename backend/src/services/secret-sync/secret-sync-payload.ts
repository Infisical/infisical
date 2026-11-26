import handlebars from "handlebars";
import path from "path";

import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

export const MAX_REPORTED_KEY_CONFLICTS = 5;

export type TSecretPayload = {
  key: string;
  path: string;
  value: string;
  id?: string;
  comment?: string;
  secretMetadata?: TSecretMap[string]["secretMetadata"];
};

export type TSecretSyncPayload = {
  secrets: TSecretPayload[];
  environment: string;
  flatten: (opts?: { disableKeySchema?: boolean }) => TSecretMap;
  mirror: () => TSecretMap;
  mirroredFolders: () => Set<string>;
  findConflicts: (opts?: { disableKeySchema?: boolean }) => TSecretSyncConflict[];
  tolerateConflicts: () => TSecretSyncPayload;
};

export type TSecretSyncConflict = {
  key: string;
  paths: string[];
};

export const getKeyWithSchema = ({
  key,
  environment,
  schema
}: {
  key: string;
  environment: string;
  schema?: string;
}) => {
  if (!schema) return key;

  return handlebars.compile(schema)({
    secretKey: key,
    environment
  });
};

const groupByDestinationKey = (
  { secrets, environment }: Pick<TSecretSyncPayload, "secrets" | "environment">,
  schema?: string
): Map<string, TSecretPayload[]> => {
  const grouped = new Map<string, TSecretPayload[]>();

  for (const entry of secrets) {
    const destinationKey = getKeyWithSchema({ key: entry.key, environment, schema });
    const group = grouped.get(destinationKey);

    if (group) group.push(entry);
    else grouped.set(destinationKey, [entry]);
  }

  return grouped;
};

// Returns every destination-key collision, unordered and untruncated: the caller decides how much
// of this to show. findConflicts() below is the public way to reach this on a built payload; the
// recursive-conflicts preview endpoint calls that method, not this function directly, so
// keySchema never has to be a field the payload object exposes to its own callers.
export const findFlattenConflicts = (
  payload: { secrets: TSecretPayload[]; environment: string; keySchema?: string },
  { disableKeySchema = false }: { disableKeySchema?: boolean } = {}
): TSecretSyncConflict[] => {
  const schema = disableKeySchema ? undefined : payload.keySchema;
  const grouped = groupByDestinationKey(payload, schema);

  return [...grouped.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, paths: group.map((entry) => entry.path).sort() }));
};

const describeConflicts = (conflicts: TSecretSyncConflict[]) => {
  const shown = conflicts.slice(0, MAX_REPORTED_KEY_CONFLICTS);
  const remainder = conflicts.length - shown.length;

  const detail = shown.map(({ key, paths }) => `"${key}" in ${paths.join(" and ")}`).join("; ");

  return `${detail}${remainder > 0 ? `, and ${remainder} more` : ""}`;
};

const buildConflictError = (conflicts: TSecretSyncConflict[]) =>
  new SecretSyncError({
    message: `This destination stores secrets in a single flat list, so each name can be used only once. These names are used in more than one folder: ${describeConflicts(conflicts)}. Rename or move one secret in each pair, or point the sync at a narrower secret path.`,
    shouldRetry: false
  });

// The folder part of a name mirror() builds, eg "api/payments" for "api/payments/STRIPE_KEY", and ""
// for a name in the source folder itself.
export const getMirroredFolder = (name: string) => name.substring(0, Math.max(name.lastIndexOf("/"), 0));

const getMirroredName = (
  entry: TSecretPayload,
  { environment, keySchema, sourcePath }: { environment: string; keySchema?: string; sourcePath: string }
) => {
  const folder = path.posix.relative(sourcePath, entry.path);
  const key = getKeyWithSchema({ key: entry.key, environment, schema: keySchema });

  return folder ? `${folder}/${key}` : key;
};

const toSecretMapEntry = ({ value, id, comment, secretMetadata }: TSecretPayload): TSecretMap[string] => ({
  value,
  id,
  comment,
  secretMetadata
});

export const createSecretSyncPayload = (
  secrets: TSecretPayload[],
  {
    environment,
    keySchema,
    sourcePath = "/",
    folderPaths = [sourcePath],
    allowConflicts = false
  }: {
    environment: string;
    keySchema?: string;
    sourcePath?: string;
    folderPaths?: string[];
    allowConflicts?: boolean;
  }
): TSecretSyncPayload => ({
  secrets,
  environment,
  // A destination whose sync targets can't carry the configured key schema (eg a many-to-one JSON
  // body whose fields are app-facing variable names) calls flatten({ disableKeySchema: true }) to
  // get the raw-key view instead. Either way flatten() still groups by the resulting destination
  // key and rejects collisions, so duplicate-name detection never depends on whether the schema
  // was applied.
  flatten: ({ disableKeySchema = false }: { disableKeySchema?: boolean } = {}) => {
    const conflicts = findFlattenConflicts({ secrets, environment, keySchema }, { disableKeySchema });

    if (conflicts.length && !allowConflicts) throw buildConflictError(conflicts);

    const schema = disableKeySchema ? undefined : keySchema;
    const grouped = groupByDestinationKey({ secrets, environment }, schema);
    const map: TSecretMap = {};

    for (const [destinationKey, [entry]] of grouped) {
      map[destinationKey] = toSecretMapEntry(entry);
    }

    return map;
  },
  // For a destination that keeps the sync's folders as path segments: each key is its folder,
  // relative to the source folder, joined to the key, eg "api/payments/STRIPE_KEY". The key schema
  // only renames the last segment. A folder can't hold the same key twice, but a name saved before
  // "/" was refused in secret names adds folders of its own: "b/X" in /a and "X" in /a/b are both
  // "a/b/X", so that collision is refused like a flattened one.
  mirror: () => {
    const grouped = new Map<string, TSecretPayload[]>();

    for (const entry of secrets) {
      const name = getMirroredName(entry, { environment, keySchema, sourcePath });
      const group = grouped.get(name);

      if (group) group.push(entry);
      else grouped.set(name, [entry]);
    }

    const conflicts = [...grouped.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([key, group]) => ({ key, paths: group.map((entry) => entry.path).sort() }));

    if (conflicts.length && !allowConflicts) {
      throw new SecretSyncError({
        message: `Two secrets would be written to the same name, because a secret name containing "/" adds folders to it: ${describeConflicts(conflicts)}. Rename one secret in each pair.`,
        shouldRetry: false
      });
    }

    const map: TSecretMap = {};

    for (const [name, [entry]] of grouped) {
      map[name] = toSecretMapEntry(entry);
    }

    return map;
  },
  // The folders, relative to the source folder, whose names a sync that preserves folder structure
  // owns at the destination: every synced folder, including an empty one so the copies of its last
  // secrets still get deleted, and any folder a name containing "/" writes into. Names in other
  // folders below the destination path belong to something else, eg another sync, and are left alone.
  mirroredFolders: () =>
    new Set([
      ...folderPaths.map((folderPath) => path.posix.relative(sourcePath, folderPath)),
      ...secrets.map((entry) => getMirroredFolder(getMirroredName(entry, { environment, keySchema, sourcePath })))
    ]),
  // keySchema itself is deliberately not a field on this object: nothing outside this module
  // needs to read it directly, and findConflicts() is how an external caller (the
  // recursive-conflicts preview endpoint) reaches the same check flatten() runs, without it.
  findConflicts: (opts) => findFlattenConflicts({ secrets, environment, keySchema }, opts),
  // Removal hands the whole payload to a provider's own removeSecrets, which calls flatten()
  // itself with no idea this is a removal, so tolerating a duplicate name has to happen here,
  // before that flatten() call exists to throw on it: a sync that has drifted into a
  // duplicate-name state must still be removable, since deleteSyncOnComplete only drops the sync
  // row after a successful remove. The returned payload's flatten() keeps the first entry for each
  // destination key. Its secrets stay whole, since mirror() names same-named secrets in different
  // folders apart and removal has to delete each of them.
  tolerateConflicts: () =>
    createSecretSyncPayload(secrets, { environment, keySchema, sourcePath, folderPaths, allowConflicts: true })
});
