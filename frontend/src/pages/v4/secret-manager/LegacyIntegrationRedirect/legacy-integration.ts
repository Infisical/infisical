import { SecretSync } from "@app/hooks/api/secretSyncs/enums";

import { v4Path } from "../../links";

const RENAMED_DESTINATIONS: Partial<Record<string, SecretSync>> = {
  "aws-secret-manager": SecretSync.AWSSecretsManager,
  travisci: SecretSync.TravisCI
};

const DESTINATIONS = new Set<string>(Object.values(SecretSync));

export const syncDestinationOf = (provider?: string) => {
  if (!provider) return undefined;
  if (RENAMED_DESTINATIONS[provider]) return RENAMED_DESTINATIONS[provider];
  return DESTINATIONS.has(provider) ? (provider as SecretSync) : undefined;
};

export const SECRET_SYNCS_PATH = v4Path(
  "/organizations/$orgId/projects/secret-management/$projectId/integrations"
);
