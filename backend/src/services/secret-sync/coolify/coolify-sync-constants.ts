import RE2 from "re2";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const COOLIFY_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Coolify",
  destination: SecretSync.Coolify,
  connection: AppConnection.Coolify,
  canRemoveSecretsOnDeletion: true,
  canImportSecrets: true
};

const COOLIFY_ENV_VAR_NAME_PATTERN = new RE2(/^[A-Za-z_][A-Za-z0-9_.]{0,254}$/);
// Coolify generates and manages these itself, such as a service's database password, and lets the API
// delete them even though the service breaks without them
const COOLIFY_MANAGED_ENV_VAR_PREFIX = "SERVICE_";

export const isManagedByCoolify = (name: string) => name.startsWith(COOLIFY_MANAGED_ENV_VAR_PREFIX);

export const COOLIFY_ENV_VAR_NAME_RULE = `Coolify environment variable names must start with a letter or underscore, contain only letters, digits, underscores and periods, and be at most 255 characters. Names starting with ${COOLIFY_MANAGED_ENV_VAR_PREFIX} are managed by Coolify and can't be synced.`;

export const isValidCoolifyEnvVarName = (name: string) =>
  COOLIFY_ENV_VAR_NAME_PATTERN.test(name) && !isManagedByCoolify(name);
