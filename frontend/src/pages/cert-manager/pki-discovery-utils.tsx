import { Badge } from "@app/components/v3";
import { PkiDiscoveryScanStatus, TPkiInstallation } from "@app/hooks/api";

export const getGatewayLabel = (installation: TPkiInstallation): string | null => {
  const { gatewayName } = installation.locationDetails;
  return gatewayName || null;
};

export const getEndpoint = (installation: TPkiInstallation): string => {
  const { ipAddress, fqdn, port } = installation.locationDetails;
  const host = fqdn || ipAddress;
  if (host) {
    return `${host}:${port || 443}`;
  }
  return "-";
};

export const parsePorts = (portsStr: string | undefined): string[] => {
  if (!portsStr) return [];

  return portsStr
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
};

export const getDiscoveryStatusBadge = (
  status: PkiDiscoveryScanStatus | null,
  isActive: boolean,
  hasWarnings?: boolean
) => {
  if (!isActive) {
    return <Badge variant="neutral">Paused</Badge>;
  }

  switch (status) {
    case PkiDiscoveryScanStatus.Running:
      return <Badge variant="info">Running</Badge>;
    case PkiDiscoveryScanStatus.Pending:
      return <Badge variant="info">Pending</Badge>;
    case PkiDiscoveryScanStatus.Completed:
      if (hasWarnings) {
        return <Badge variant="warning">Warning</Badge>;
      }
      return <Badge variant="success">Active</Badge>;
    case PkiDiscoveryScanStatus.Failed:
      return <Badge variant="danger">Error</Badge>;
    default:
      return <Badge variant="neutral">Not Run</Badge>;
  }
};

export const getScanStatusBadge = (status: string) => {
  switch (status) {
    case PkiDiscoveryScanStatus.Running:
      return <Badge variant="info">Running</Badge>;
    case PkiDiscoveryScanStatus.Pending:
      return <Badge variant="info">Pending</Badge>;
    case PkiDiscoveryScanStatus.Completed:
      return <Badge variant="success">Completed</Badge>;
    case PkiDiscoveryScanStatus.Failed:
      return <Badge variant="danger">Failed</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
};
