import { Badge } from "@app/components/v3";
import {
  ProjectPermissionPkiCertificateInstallationActions,
  ProjectPermissionPkiDiscoveryActions,
  ProjectPermissionSub,
  useProjectPermission
} from "@app/context";
import {
  PkiCertificateFileFormat,
  PkiDiscoveryScanStatus,
  PkiInstallationLocationType,
  PkiKeystoreStatus,
  TPkiInstallation
} from "@app/hooks/api";

export const getGatewayLabel = (installation: TPkiInstallation): string | null => {
  const { gatewayName } = installation.locationDetails;
  return gatewayName || null;
};

export const isHostFileInstallation = (installation: TPkiInstallation) =>
  installation.locationType === PkiInstallationLocationType.Filesystem ||
  installation.locationType === PkiInstallationLocationType.Keystore;

export const getEndpoint = (installation: TPkiInstallation): string => {
  const { ipAddress, fqdn, port, hostIdentifier, filePath } = installation.locationDetails;
  if (isHostFileInstallation(installation) && filePath) {
    return hostIdentifier ? `${hostIdentifier}:${filePath}` : filePath;
  }
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

export const getKeystoreStatusBadge = (installation: TPkiInstallation) => {
  switch (installation.metadata?.keystoreStatus) {
    case PkiKeystoreStatus.Locked:
      return <Badge variant="warning">Locked</Badge>;
    case PkiKeystoreStatus.PasswordFailed:
      return <Badge variant="danger">Password Failed</Badge>;
    default:
      return null;
  }
};

export const canSetKeystorePassword = (installation: TPkiInstallation) => {
  if (installation.locationType !== PkiInstallationLocationType.Keystore) return false;
  const { format } = installation.locationDetails;
  if (format && format !== PkiCertificateFileFormat.Pkcs12) return false;
  const status = installation.metadata?.keystoreStatus;
  return (
    Boolean(installation.hasKeystorePassword) ||
    status === PkiKeystoreStatus.Locked ||
    status === PkiKeystoreStatus.PasswordFailed
  );
};

export const useCanRescanPkiInstallations = () => {
  const { permission } = useProjectPermission();
  return (
    permission.can(
      ProjectPermissionPkiCertificateInstallationActions.Edit,
      ProjectPermissionSub.PkiCertificateInstallations
    ) &&
    permission.can(ProjectPermissionPkiDiscoveryActions.RunScan, ProjectPermissionSub.PkiDiscovery)
  );
};

export const getItemLabel = (item: string) => item;
