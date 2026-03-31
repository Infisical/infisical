import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { APP_CONNECTION_MAP } from "./appConnections";

/** App connection types that support org-level in-platform migration configuration. */
export const IN_PLATFORM_MIGRATION_APP_CONNECTIONS = [
  AppConnection.HCVault,
  AppConnection.Doppler
] as const;

export type TInPlatformMigrationApp = (typeof IN_PLATFORM_MIGRATION_APP_CONNECTIONS)[number];

export const IN_PLATFORM_MIGRATION_PROVIDER_DETAILS: Record<
  TInPlatformMigrationApp,
  { description: string }
> = {
  [AppConnection.HCVault]: {
    description:
      "Policy imports, auth methods, secret engine migrations, and importing secrets from Vault in the UI."
  },
  [AppConnection.Doppler]: {
    description: "Import secrets from Doppler into Infisical projects from the UI."
  }
};

export function getInPlatformMigrationProviderMeta(app: TInPlatformMigrationApp) {
  const meta = APP_CONNECTION_MAP[app];
  return {
    name: meta.name,
    imageFileName: meta.image,
    size: meta.size ?? 50
  };
}
