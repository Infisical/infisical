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
  all: () => TSecretPayload[];
  flatten: () => TSecretMap;
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

export const createSecretSyncPayload = (
  secrets: TSecretPayload[],
  { environment, keySchema }: { environment: string; keySchema?: string }
): TSecretSyncPayload => {
  let flattened: TSecretMap | undefined;

  return {
    all: () => secrets,
    flatten: () => {
      if (flattened) return flattened;

      const grouped = new Map<string, TSecretPayload[]>();

      for (const entry of secrets) {
        const destinationKey = getKeyWithSchema({ key: entry.key, environment, schema: keySchema });
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

      flattened = map;
      return map;
    }
  };
};
