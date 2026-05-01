import { format } from "date-fns";

import {
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
import { TPkiInstallation } from "@app/hooks/api";

type Props = {
  installation: TPkiInstallation;
};

export const InstallationDetailsSection = ({ installation }: Props) => {
  const { locationDetails } = installation;
  const endpoint = locationDetails.fqdn || locationDetails.ipAddress;

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
            {endpoint && (
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
