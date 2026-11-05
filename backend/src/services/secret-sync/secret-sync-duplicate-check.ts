import { deepEqualSkipFields } from "@app/lib/fn/object";

import { GitHubSyncSecretType } from "./github/github-sync-enums";
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

// Configs saved before one of these fields existed omit it, and behave as if they held the default.
const DEFAULTED_FIELDS: Partial<Record<SecretSync, Record<string, unknown>>> = {
  [SecretSync.GitHub]: { secretType: GitHubSyncSecretType.Actions }
};

const fillDefaultedFields = (destination: SecretSync, config: unknown) => {
  const defaults = DEFAULTED_FIELDS[destination];
  if (!defaults || !config || typeof config !== "object" || Array.isArray(config)) return config;

  const filled: Record<string, unknown> = { ...config };
  Object.entries(defaults).forEach(([key, value]) => {
    if (filled[key] === undefined) filled[key] = value;
  });
  return filled;
};

const normalizeDestinationConfig = (destination: SecretSync, config: unknown) =>
  normalizeOptionalScope(destination, fillDefaultedFields(destination, config));

export const areSecretSyncDestinationConfigsEqual = (
  destination: SecretSync,
  existingConfig: unknown,
  newConfig: unknown,
  skipFields: string[]
) =>
  deepEqualSkipFields(
    normalizeDestinationConfig(destination, existingConfig),
    normalizeDestinationConfig(destination, newConfig),
    skipFields
  );
