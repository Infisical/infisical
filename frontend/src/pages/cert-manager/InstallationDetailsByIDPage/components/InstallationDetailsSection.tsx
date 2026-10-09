import { format } from "date-fns";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue
} from "@app/components/v3";
import {
  PkiCertificateFileFormatLabels,
  PkiInstallationLocationType,
  TPkiInstallation
} from "@app/hooks/api";
import {
  getKeystoreStatusBadge,
  isHostFileInstallation
} from "@app/pages/cert-manager/pki-discovery-utils";

type Props = {
  installation: TPkiInstallation;
};

export const InstallationDetailsSection = ({ installation }: Props) => {
  const { locationDetails } = installation;
  const endpoint = locationDetails.fqdn || locationDetails.ipAddress;
  const isHostFile = isHostFileInstallation(installation);
  const isKeystore = installation.locationType === PkiInstallationLocationType.Keystore;

  return (
    <div className="flex w-full flex-col gap-5">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Details</CardTitle>
          <CardDescription>Installation information</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailGroup>
            <Detail>
              <DetailLabel>Name</DetailLabel>
              <DetailValue>
                {installation.name || <span className="text-muted">-</span>}
              </DetailValue>
            </Detail>
            {isHostFile && (
              <>
                <Detail>
                  <DetailLabel>Host</DetailLabel>
                  <DetailValue>
                    {locationDetails.hostname || <span className="text-muted">-</span>}
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Address</DetailLabel>
                  <DetailValue>
                    {locationDetails.hostIdentifier || <span className="text-muted">-</span>}
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Path</DetailLabel>
                  <DetailValue className="font-mono break-all">
                    {locationDetails.filePath}
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Connection</DetailLabel>
                  <DetailValue>
                    {installation.connection?.name || <span className="text-muted">-</span>}
                  </DetailValue>
                </Detail>
                {locationDetails.format && (
                  <Detail>
                    <DetailLabel>Format</DetailLabel>
                    <DetailValue>
                      {PkiCertificateFileFormatLabels[locationDetails.format]}
                    </DetailValue>
                  </Detail>
                )}
              </>
            )}
            {isKeystore && (
              <Detail>
                <DetailLabel>Keystore Password</DetailLabel>
                <DetailValue>
                  {getKeystoreStatusBadge(installation) ??
                    (installation.hasKeystorePassword ? (
                      <Badge variant="success">Set</Badge>
                    ) : (
                      <span className="text-muted">Not needed</span>
                    ))}
                </DetailValue>
              </Detail>
            )}
            {endpoint && !isHostFile && (
              <Detail>
                <DetailLabel>Endpoint</DetailLabel>
                <DetailValue>
                  {endpoint}
                  {locationDetails.port ? `:${locationDetails.port}` : ""}
                </DetailValue>
              </Detail>
            )}
            {locationDetails.gatewayName ? (
              <Detail>
                <DetailLabel>Gateway</DetailLabel>
                <DetailValue>{locationDetails.gatewayName}</DetailValue>
              </Detail>
            ) : null}
            <Detail>
              <DetailLabel>Last Seen By</DetailLabel>
              <DetailValue>
                {installation.discoveryName || <span className="text-muted">-</span>}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Last Seen</DetailLabel>
              <DetailValue>
                {format(new Date(installation.lastSeenAt), "MMM dd, yyyy HH:mm")}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>First Seen</DetailLabel>
              <DetailValue>
                {format(new Date(installation.createdAt), "MMM dd, yyyy HH:mm")}
              </DetailValue>
            </Detail>
          </DetailGroup>
        </CardContent>
      </Card>
    </div>
  );
};
