import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection } from "@app/hooks/api/appConnections/types";
import { AzureKeyVaultConnectionMethod } from "@app/hooks/api/appConnections/types/azure-key-vault-connection";

import { CONNECTION_PRESETS } from "../data/integrations/connection-presets";

export const NOT_IN_V4 = "Not in v4 yet";

export const methodPreset = (row: TAppConnection) =>
  CONNECTION_PRESETS[row.app]?.methods.find((entry) => entry.value === row.method);

/** Why the credentials sheet can't open for this connection in v4, or undefined when it can. */
export const credentialsBlock = (row: TAppConnection) =>
  row.isPlatformManagedCredentials || methodPreset(row) ? undefined : NOT_IN_V4;

export const isManagedIdentity = (connection: Pick<TAppConnection, "app" | "method">) =>
  connection.app === AppConnection.AzureKeyVault &&
  connection.method === AzureKeyVaultConnectionMethod.ManagedIdentity;

export type FederatedCredential = {
  issuerUrl: string | null;
  subjectIdentifier: string;
  audience: string;
};

export const federatedCredentialOf = (connection: TAppConnection) =>
  (connection.credentials as { federatedCredential?: FederatedCredential } | undefined)
    ?.federatedCredential;

export const storedScopes = (connection: TAppConnection) =>
  connection.app === AppConnection.Databricks
    ? ((connection.credentials as { scopes?: string[] } | undefined)?.scopes ?? [])
    : [];
