import {
  Badge,
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
import { TPkiDiscovery } from "@app/hooks/api";
import { parsePorts } from "@app/pages/cert-manager/pki-discovery-utils";

type Props = {
  discovery: TPkiDiscovery;
};

export const DiscoveryTargetSection = ({ discovery }: Props) => {
  const { targetConfig } = discovery;
  const { ports: portsStr } = targetConfig;
  const domains = targetConfig.domains || [];
  const ipRanges = targetConfig.ipRanges || [];

  const ports = parsePorts(portsStr);

  return (
    <UnstableCard>
      <UnstableCardHeader className="border-b">
        <UnstableCardTitle>Target Configuration</UnstableCardTitle>
        <UnstableCardDescription>Targets scanned by this discovery job</UnstableCardDescription>
      </UnstableCardHeader>
      <UnstableCardContent>
        <DetailGroup>
          {domains.length > 0 && (
            <Detail>
              <DetailLabel>Domains</DetailLabel>
              <DetailValue>
                <div className="flex flex-wrap gap-1">
                  {domains.map((domain) => (
                    <Badge key={domain} variant="neutral">
                      {domain}
                    </Badge>
                  ))}
                </div>
              </DetailValue>
            </Detail>
          )}
          {ipRanges.length > 0 && (
            <Detail>
              <DetailLabel>IP Ranges</DetailLabel>
              <DetailValue>
                <div className="flex flex-wrap gap-1">
                  {ipRanges.map((range) => (
                    <Badge key={range} variant="neutral">
                      {range}
                    </Badge>
                  ))}
                </div>
              </DetailValue>
            </Detail>
          )}
          <Detail>
            <DetailLabel>Ports</DetailLabel>
            <DetailValue>
              <div className="flex flex-wrap gap-1">
                {ports.length === 0 ? (
                  <Badge variant="neutral">443</Badge>
                ) : (
                  ports.map((port) => (
                    <Badge key={port} variant="neutral">
                      {port}
                    </Badge>
                  ))
                )}
              </div>
            </DetailValue>
          </Detail>
        </DetailGroup>
      </UnstableCardContent>
    </UnstableCard>
  );
};
