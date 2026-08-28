import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { PkiSync } from "./pki-sync-enums";
import { PKI_SYNC_NAME_MAP } from "./pki-sync-maps";

type TTargetHostConnection = {
  app: AppConnection;
  name: string;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
};

export type TPkiSyncDeliveryTarget = {
  host?: string;
  port?: number;
  sslEnabled?: boolean;
  sslRejectUnauthorized?: boolean;
  sslCertificate?: string;
};

const LDAP_ONLY_TARGET_FIELDS = [
  "host",
  "port",
  "sslEnabled",
  "sslRejectUnauthorized",
  "sslCertificate"
] as const satisfies readonly (keyof TPkiSyncDeliveryTarget)[];

export const getPkiSyncTargetHost = (
  destinationConfig: Record<string, unknown> | null | undefined
): string | undefined => (destinationConfig as { host?: string } | undefined)?.host;

export const assertTargetHostMatchesConnection = ({
  destination,
  connection,
  destinationConfig
}: {
  destination: PkiSync;
  connection: TTargetHostConnection;
  destinationConfig: (Record<string, unknown> & { host?: string }) | undefined;
}) => {
  const host = getPkiSyncTargetHost(destinationConfig);

  if (connection.app !== AppConnection.LDAP) {
    const setFields = LDAP_ONLY_TARGET_FIELDS.filter((field) => destinationConfig?.[field] !== undefined);
    if (setFields.length) {
      throw new BadRequestError({
        message: `${setFields.join(", ")} cannot be set when using the '${connection.name}' connection, because that connection already targets a single host and supplies these itself. Remove them, or select an LDAP connection to choose the host per sync.`
      });
    }
    return;
  }

  const destinationName = PKI_SYNC_NAME_MAP[destination];

  if (!host) {
    throw new BadRequestError({
      message: `A target host is required when using the LDAP connection '${connection.name}', because an LDAP connection can reach many machines. Set the target host to the machine this ${destinationName} sync should deliver to.`
    });
  }

  if (destination === PkiSync.WindowsServer && !connection.gatewayId && !connection.gatewayPoolId) {
    throw new BadRequestError({
      message: `${destinationName} syncs reach the host over WinRM, which requires a Gateway. Assign a Gateway to the LDAP connection '${connection.name}' before using it for this sync.`
    });
  }
};
