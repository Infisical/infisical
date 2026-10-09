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
  DetailValue,
  OverflowBadgeList
} from "@app/components/v3";
import { PkiDiscoveryType, TPkiDiscovery } from "@app/hooks/api";
import { getItemLabel, parsePorts } from "@app/pages/cert-manager/pki-discovery-utils";

type Props = {
  discovery: TPkiDiscovery;
};

const LinuxServerTargetSection = ({ discovery }: Props) => {
  const { targetConfig } = discovery;
  const connectionsById = new Map((discovery.connections ?? []).map((c) => [c.id, c.name]));
  const connectionIds = targetConfig.connectionIds ?? [];

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Target Configuration</CardTitle>
        <CardDescription>Servers and folders scanned by this discovery job</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          <Detail>
            <DetailLabel>SSH Connections</DetailLabel>
            <DetailValue>
              <OverflowBadgeList
                items={connectionIds}
                getKey={(id) => id}
                getLabel={(id) => connectionsById.get(id) ?? "Deleted connection"}
              />
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Search Folders</DetailLabel>
            <DetailValue>
              <OverflowBadgeList
                items={targetConfig.searchFolderPaths ?? []}
                getKey={getItemLabel}
                getLabel={getItemLabel}
              />
            </DetailValue>
          </Detail>
          {Boolean(targetConfig.skipFolderPaths?.length) && (
            <Detail>
              <DetailLabel>Skip Folders</DetailLabel>
              <DetailValue>
                <OverflowBadgeList
                  items={targetConfig.skipFolderPaths ?? []}
                  getKey={getItemLabel}
                  getLabel={getItemLabel}
                />
              </DetailValue>
            </Detail>
          )}
          <Detail>
            <DetailLabel>Folder Depth</DetailLabel>
            <DetailValue>{targetConfig.maxFolderDepth}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Largest File</DetailLabel>
            <DetailValue>{targetConfig.maxFileSizeKb} KB</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Import CA Certificates Found on Their Own</DetailLabel>
            <DetailValue>
              <Badge variant={targetConfig.importStandaloneCaCertificates ? "success" : "neutral"}>
                {targetConfig.importStandaloneCaCertificates ? "Enabled" : "Disabled"}
              </Badge>
            </DetailValue>
          </Detail>
        </DetailGroup>
      </CardContent>
    </Card>
  );
};

export const DiscoveryTargetSection = ({ discovery }: Props) => {
  if (discovery.discoveryType === PkiDiscoveryType.LinuxServer) {
    return <LinuxServerTargetSection discovery={discovery} />;
  }

  const { targetConfig } = discovery;
  const { ports: portsStr } = targetConfig;
  const domains = targetConfig.domains || [];
  const ipRanges = targetConfig.ipRanges || [];

  const ports = parsePorts(portsStr);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Target Configuration</CardTitle>
        <CardDescription>Targets scanned by this discovery job</CardDescription>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
};
