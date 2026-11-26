import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection } from "@app/hooks/api/appConnections/types";

import { CONNECTION_PRESETS } from "../data/integrations/connection-presets";
import { notPorted } from "../not-ported";

export const appName = (app: AppConnection) => APP_CONNECTION_MAP[app].name;
export const methodName = (row: TAppConnection) => getAppConnectionMethodDetails(row.method).name;

export const methodPreset = (row: TAppConnection) =>
  CONNECTION_PRESETS[row.app]?.methods.find((entry) => entry.value === row.method);

/** Why the credentials sheet can't open for this connection in v4, or undefined when it can. */
export const credentialsBlock = (row: TAppConnection) =>
  row.isPlatformManagedCredentials || methodPreset(row)
    ? undefined
    : notPorted("Editing these credentials");

/** The stored credentials a federated connection sends back to verify itself as it is. */
export const verifyCredentials = (connection: TAppConnection) => {
  if (connection.app === AppConnection.GCP) {
    const { workloadIdentityProvider, serviceAccountEmail } = connection.credentials as {
      workloadIdentityProvider: string;
      serviceAccountEmail?: string;
    };
    return { workloadIdentityProvider, serviceAccountEmail: serviceAccountEmail || undefined };
  }
  const { tenantId, clientId } = connection.credentials as { tenantId: string; clientId: string };
  return { tenantId, clientId };
};

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
