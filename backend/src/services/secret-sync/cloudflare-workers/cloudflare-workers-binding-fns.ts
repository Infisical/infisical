import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretMap } from "@app/services/secret-sync/secret-sync-types";

import { CloudflareWorkersVariableType } from "./cloudflare-workers-constants";
import { TCloudflareWorkersSyncWithCredentials } from "./cloudflare-workers-types";

const VARIABLE_BINDING_TYPES = new Set<string>(Object.values(CloudflareWorkersVariableType));

export type TWrittenBinding = {
  type: string;
  name: string;
  text?: string;
  json?: unknown;
};

// Every base binding that is neither written nor dropped is inherited from the base version unchanged.
export type TBindingPlan = { written: TWrittenBinding[]; dropped: string[] };

const VARIABLE_TYPE_LABELS: Record<string, string> = {
  [CloudflareWorkersVariableType.Secret]: "secret",
  [CloudflareWorkersVariableType.Text]: "text",
  [CloudflareWorkersVariableType.Json]: "JSON"
};

// Changing a variable's type can break the Worker, since a JSON variable reaches it as a parsed object, or
// expose a secret's value in the dashboard. A sync never changes one; it fails before writing anything.
export const throwOnTypeConflicts = (conflicts: Array<{ name: string; type: string }>, fix: string) => {
  if (conflicts.length === 0) return;

  throw new SecretSyncError({
    message: `The following secrets already exist on the Cloudflare Worker as a different type: ${conflicts
      .map(({ name, type }) => `${name} (${VARIABLE_TYPE_LABELS[type]})`)
      .join(", ")}. Infisical doesn't change a variable's type, so nothing was synced. ${fix}`,
    shouldRetry: false
  });
};

export const throwOnNonVariableConflicts = (
  bindings: Array<{ type: string; name: string }>,
  secretMapKeys: Set<string>
) => {
  const conflictingKeys = bindings
    .filter((binding) => secretMapKeys.has(binding.name) && !VARIABLE_BINDING_TYPES.has(binding.type))
    .map((binding) => binding.name);

  if (conflictingKeys.length > 0) {
    throw new SecretSyncError({
      message: `The following secrets have the same name as another binding on the Cloudflare Worker, such as a KV namespace or a service: ${conflictingKeys.join(", ")}. Rename the secrets in Infisical, or use a key schema to change their names in Cloudflare.`,
      shouldRetry: false
    });
  }
};

// The binding types a sync writes and deletes; the same split as $getManagedBindings in cloudflare-workers-fns.ts.
const $getManagedTypes = (secretSync: TCloudflareWorkersSyncWithCredentials) => {
  const { variableType = CloudflareWorkersVariableType.Secret } = secretSync.destinationConfig;

  if (variableType !== CloudflareWorkersVariableType.Secret) return new Set<string>([variableType]);

  return secretSync.syncOptions.syncNonSecretBindings
    ? new Set<string>(VARIABLE_BINDING_TYPES)
    : new Set<string>([CloudflareWorkersVariableType.Secret]);
};

const $isManagedBySchema = (secretSync: TCloudflareWorkersSyncWithCredentials, name: string) =>
  matchesSchema(name, secretSync.environment?.slug || "", secretSync.syncOptions.keySchema);

// The full set of changes a sync makes, applied to a version's bindings by the version fallback. It follows the
// in-place sync's rules for each variable type, the toggle, and deletion.
export const planSyncBindings = (
  secretSync: TCloudflareWorkersSyncWithCredentials,
  secretMap: TSecretMap,
  baseBindings: Array<{ type: string; name: string }>
): TBindingPlan => {
  const {
    destinationConfig: { variableType },
    syncOptions: { disableSecretDeletion }
  } = secretSync;
  const syncType = variableType ?? CloudflareWorkersVariableType.Secret;
  const managedTypes = $getManagedTypes(secretSync);
  const secretMapKeys = new Set(Object.keys(secretMap));
  const baseTypes = new Map(baseBindings.map(({ name, type }) => [name, type]));

  throwOnNonVariableConflicts(baseBindings, secretMapKeys);

  const typeConflicts = baseBindings.filter(
    (binding) => secretMapKeys.has(binding.name) && !managedTypes.has(binding.type)
  );

  // A sync created before the type could be chosen skips same-name variables of another type.
  if (variableType) {
    throwOnTypeConflicts(
      typeConflicts,
      syncType === CloudflareWorkersVariableType.Secret
        ? 'Delete them in Cloudflare, change the sync\'s variable type, or turn on "Sync plaintext and JSON variables" to update them as they are.'
        : "Delete them in Cloudflare or change the sync's variable type, then sync again."
    );
  }

  const written: TWrittenBinding[] = [];
  const invalidJsonKeys: string[] = [];

  for (const [name, { value }] of Object.entries(secretMap)) {
    const baseType = baseTypes.get(name);
    if (baseType === undefined || managedTypes.has(baseType)) {
      const type = baseType ?? syncType;
      if (type === CloudflareWorkersVariableType.Json) {
        try {
          written.push({ type, name, json: JSON.parse(value) as unknown });
        } catch {
          invalidJsonKeys.push(name);
        }
      } else {
        written.push({ type, name, text: value });
      }
    }
  }

  if (invalidJsonKeys.length > 0) {
    throw new SecretSyncError({
      message: `The following secrets are not valid JSON, so they cannot be synced as Cloudflare Workers JSON variables: ${invalidJsonKeys.join(", ")}. Fix their values in Infisical or change the sync's variable type.`,
      shouldRetry: false
    });
  }

  const dropped = disableSecretDeletion
    ? []
    : baseBindings
        .filter(
          (binding) =>
            managedTypes.has(binding.type) &&
            !secretMapKeys.has(binding.name) &&
            $isManagedBySchema(secretSync, binding.name)
        )
        .map(({ name }) => name);

  return { written, dropped };
};
