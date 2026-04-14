import { format } from "date-fns";

import {
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle
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
      <UnstableCard>
        <UnstableCardHeader className="border-b">
          <UnstableCardTitle>Details</UnstableCardTitle>
          <UnstableCardDescription>Installation information</UnstableCardDescription>
        </UnstableCardHeader>
        <UnstableCardContent>
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
        </UnstableCardContent>
      </UnstableCard>
    </div>
  );
};
