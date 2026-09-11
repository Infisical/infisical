import handlebars from "handlebars";

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
  flatten: (opts?: { applySchema?: boolean }) => TSecretMap;
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

const buildConflictError = (conflicts: [string, TSecretPayload[]][]) => {
  const shown = conflicts.slice(0, MAX_REPORTED_KEY_CONFLICTS);
  const remainder = conflicts.length - shown.length;

  const detail = shown
    .map(
      ([key, group]) =>
        `"${key}" in ${group
          .map((entry) => entry.path)
          .sort()
          .join(" and ")}`
    )
    .join("; ");

  return new SecretSyncError({
    message: `This destination stores secrets in a single flat list, so each name can be used only once. These names are used in more than one folder: ${detail}${
      remainder > 0 ? `, and ${remainder} more` : ""
    }. Rename or move one secret in each pair, or point the sync at a narrower secret path.`,
    shouldRetry: false
  });
};

// The remove path deletes by destination key and does not care which duplicate wins, so it
// dedupes before the payload is built. That keeps flatten() itself unconditional: a sync that
// has drifted into a duplicate-name state must still be removable, since deleteSyncOnComplete
// only drops the sync row after a successful remove.
export const dedupeEntriesByDestinationKey = (
  entries: TSecretPayload[],
  { environment, keySchema }: { environment: string; keySchema?: string }
): TSecretPayload[] => {
  const seenDestinationKeys = new Set<string>();
  const deduped: TSecretPayload[] = [];

  for (const entry of entries) {
    const destinationKey = getKeyWithSchema({ key: entry.key, environment, schema: keySchema });

    if (seenDestinationKeys.has(destinationKey)) {
      // eslint-disable-next-line no-continue
      continue;
    }

    seenDestinationKeys.add(destinationKey);
    deduped.push(entry);
  }

  return deduped;
};

export const createSecretSyncPayload = (
  secrets: TSecretPayload[],
  { environment, keySchema }: { environment: string; keySchema?: string }
): TSecretSyncPayload => ({
  secrets,
  environment,
  // A destination whose sync targets can't carry the configured key schema (eg a many-to-one
  // JSON body whose fields are app-facing variable names, or an Infisical-to-Infisical sync,
  // where a schema-renamed key would look like a new secret and retrigger a sync cycle) calls
  // flatten({ applySchema: false }) to get the raw-key view instead. Either way flatten() still
  // groups by the resulting destination key and rejects collisions, so duplicate-name detection
  // never depends on whether the schema was applied.
  flatten: ({ applySchema = true }: { applySchema?: boolean } = {}) => {
    const schema = applySchema ? keySchema : undefined;
    const grouped = new Map<string, TSecretPayload[]>();

    for (const entry of secrets) {
      const destinationKey = getKeyWithSchema({ key: entry.key, environment, schema });
      const group = grouped.get(destinationKey);

      if (group) group.push(entry);
      else grouped.set(destinationKey, [entry]);
    }

    const conflicts = [...grouped.entries()].filter(([, group]) => group.length > 1);

    if (conflicts.length) throw buildConflictError(conflicts);

    const map: TSecretMap = {};

    for (const [destinationKey, [entry]] of grouped) {
      map[destinationKey] = {
        value: entry.value,
        id: entry.id,
        comment: entry.comment,
        secretMetadata: entry.secretMetadata
      };
    }

    return map;
  }
});
