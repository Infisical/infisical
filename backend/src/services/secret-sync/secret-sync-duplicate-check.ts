import { deepEqualSkipFields } from "@app/lib/fn/object";

import { SecretSync } from "./secret-sync-enums";

// These optional scopes use the same provider destination when empty or omitted.
const OPTIONAL_SCOPE_FIELDS: Partial<Record<SecretSync, string>> = {
  [SecretSync.Bitbucket]: "environmentId",
  [SecretSync.TeamCity]: "buildConfig",
  [SecretSync.Qovery]: "environmentId"
};

const normalizeOptionalScope = (destination: SecretSync, config: unknown) => {
  const field = OPTIONAL_SCOPE_FIELDS[destination];
  if (!field || !config || typeof config !== "object" || Array.isArray(config)) return config;

  return Object.fromEntries(
    Object.entries(config).filter(
      ([key, value]) => key !== field || (value !== "" && value !== null && value !== undefined)
    )
  );
};

export const areSecretSyncDestinationConfigsEqual = (
  destination: SecretSync,
  existingConfig: unknown,
  newConfig: unknown,
  skipFields: string[]
) =>
  deepEqualSkipFields(
    normalizeOptionalScope(destination, existingConfig),
    normalizeOptionalScope(destination, newConfig),
    skipFields
  );
