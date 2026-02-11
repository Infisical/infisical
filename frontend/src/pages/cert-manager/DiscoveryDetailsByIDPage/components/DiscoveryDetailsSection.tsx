import { format } from "date-fns";

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
import { PkiDiscoveryTypeLabels, TPkiDiscovery } from "@app/hooks/api";
import { getDiscoveryStatusBadge } from "@app/pages/cert-manager/pki-discovery-utils";

type Props = {
  discovery: TPkiDiscovery;
};

export const DiscoveryDetailsSection = ({ discovery }: Props) => {
  return (
    <UnstableCard>
      <UnstableCardHeader className="border-b">
        <UnstableCardTitle>Details</UnstableCardTitle>
        <UnstableCardDescription>Discovery job configuration</UnstableCardDescription>
      </UnstableCardHeader>
      <UnstableCardContent>
        <DetailGroup>
          <Detail>
            <DetailLabel>Name</DetailLabel>
            <DetailValue>{discovery.name}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Type</DetailLabel>
            <DetailValue>
              {PkiDiscoveryTypeLabels[discovery.discoveryType] || discovery.discoveryType}
            </DetailValue>
          </Detail>
          {discovery.description && (
            <Detail>
              <DetailLabel>Description</DetailLabel>
              <DetailValue>{discovery.description}</DetailValue>
            </Detail>
          )}
          <Detail>
            <DetailLabel>Status</DetailLabel>
            <DetailValue>
              {getDiscoveryStatusBadge(discovery.lastScanStatus, discovery.isActive)}
            </DetailValue>
          </Detail>
          {discovery.lastScanMessage && (
            <Detail>
              <DetailLabel>Last Scan Result</DetailLabel>
              <DetailValue className="text-sm text-yellow-500">
                {discovery.lastScanMessage}
              </DetailValue>
            </Detail>
          )}
          <Detail>
            <DetailLabel>Last Scanned</DetailLabel>
            <DetailValue>
              {discovery.lastScannedAt
                ? format(new Date(discovery.lastScannedAt), "MMM dd, yyyy HH:mm")
                : "Never"}
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Auto-Scan</DetailLabel>
            <DetailValue>
              {discovery.isAutoScanEnabled ? (
                <Badge variant="success">Enabled</Badge>
              ) : (
                <Badge variant="neutral">Disabled</Badge>
              )}
            </DetailValue>
          </Detail>
          {discovery.isAutoScanEnabled && discovery.scanIntervalDays && (
            <Detail>
              <DetailLabel>Scan Interval</DetailLabel>
              <DetailValue>
                Every {discovery.scanIntervalDays} day{discovery.scanIntervalDays > 1 ? "s" : ""}
              </DetailValue>
            </Detail>
          )}
        </DetailGroup>
      </UnstableCardContent>
    </UnstableCard>
  );
};
