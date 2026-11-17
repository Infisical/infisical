import RE2 from "re2";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const CONVEX_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Convex",
  destination: SecretSync.Convex,
  connection: AppConnection.Convex,
  canRemoveSecretsOnDeletion: true,
  canImportSecrets: true
};

const CONVEX_ENV_VAR_NAME_PATTERN = new RE2(/^[A-Za-z_][A-Za-z0-9_]{0,255}$/);
// Set by Convex on every deployment, and refused if written
const CONVEX_BUILT_IN_ENV_VARS = ["CONVEX_CLOUD_URL", "CONVEX_SITE_URL"];

export const CONVEX_ENV_VAR_NAME_RULE = `Convex environment variable names must start with a letter or underscore, contain only letters, digits and underscores, be at most 256 characters, and not be ${CONVEX_BUILT_IN_ENV_VARS.join(" or ")}.`;

export const isValidConvexEnvVarName = (name: string) =>
  CONVEX_ENV_VAR_NAME_PATTERN.test(name) && !CONVEX_BUILT_IN_ENV_VARS.includes(name);
