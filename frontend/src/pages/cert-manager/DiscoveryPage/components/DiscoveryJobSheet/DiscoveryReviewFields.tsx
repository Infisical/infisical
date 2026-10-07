import { ReactNode } from "react";
import { useFormContext } from "react-hook-form";

import {
  Badge,
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue,
  OverflowBadgeList
} from "@app/components/v3";
import { PKI_DISCOVERY_TYPE_MAP } from "@app/helpers/pkiDiscovery";
import { PkiDiscoveryType } from "@app/hooks/api/pkiDiscovery/types";
import { getItemLabel } from "@app/pages/cert-manager/pki-discovery-utils";

import { parseTargets, TDiscoveryJobForm } from "./discovery-job-form-schema";
import { SCAN_INTERVAL_OPTIONS } from "./DiscoveryDetailsFields";

const ReviewDetail = ({ label, children }: { label: string; children?: ReactNode }) => (
  <Detail>
    <DetailLabel>{label}</DetailLabel>
    <DetailValue>{children || <span className="text-muted">None</span>}</DetailValue>
  </Detail>
);

const ReviewBadgesDetail = ({ label, items }: { label: string; items: string[] }) => (
  <Detail className="w-full min-w-0">
    <DetailLabel>{label}</DetailLabel>
    <DetailValue>
      {items.length ? (
        <OverflowBadgeList items={items} getKey={getItemLabel} getLabel={getItemLabel} />
      ) : (
        <span className="text-muted">None</span>
      )}
    </DetailValue>
  </Detail>
);

const ReviewGroup = ({ title, children }: { title: string; children: ReactNode }) => (
  <DetailGroup>
    <DetailGroupHeader className="border-b border-border pb-2">{title}</DetailGroupHeader>
    <div className="flex flex-wrap gap-x-8 gap-y-4">{children}</div>
  </DetailGroup>
);

export const DiscoveryReviewFields = () => {
  const { watch } = useFormContext<TDiscoveryJobForm>();
  const values = watch();

  let gatewayLabel: string | undefined;
  if (values.discoveryType === PkiDiscoveryType.Network) {
    if (values.gatewayPoolId) gatewayLabel = "Gateway pool";
    else if (values.gatewayId) gatewayLabel = "Gateway";
  }

  const networkTargets =
    values.discoveryType === PkiDiscoveryType.Network ? parseTargets(values.targets) : null;

  const scheduleLabel = values.isAutoScanEnabled
    ? SCAN_INTERVAL_OPTIONS.find((option) => option.value === values.scanIntervalDays)?.label
    : "Manual only";

  return (
    <div className="mb-4 flex flex-col gap-y-8">
      {values.discoveryType === PkiDiscoveryType.Network && (
        <ReviewGroup title="Targets">
          <ReviewBadgesDetail label="Domains" items={networkTargets?.domains ?? []} />
          <ReviewBadgesDetail label="IP Ranges" items={networkTargets?.ipRanges ?? []} />
          <ReviewDetail label="Ports">{values.ports}</ReviewDetail>
          <ReviewDetail label="Gateway">{gatewayLabel}</ReviewDetail>
        </ReviewGroup>
      )}
      {values.discoveryType === PkiDiscoveryType.LinuxServer && (
        <>
          <ReviewGroup title="Hosts">
            <ReviewBadgesDetail
              label="SSH Connections"
              items={values.connections.map((connection) => connection.name)}
            />
          </ReviewGroup>
          <ReviewGroup title="Where to Look">
            <ReviewBadgesDetail label="Search Folders" items={values.searchFolderPaths} />
            <ReviewBadgesDetail label="Skip Folders" items={values.skipFolderPaths} />
          </ReviewGroup>
          <ReviewGroup title="Options">
            <ReviewDetail label="Folder Depth">{String(values.maxFolderDepth)}</ReviewDetail>
            <ReviewDetail label="Largest File">{`${values.maxFileSizeKb} KB`}</ReviewDetail>
            <ReviewDetail label="Import CA Certificates Found on Their Own">
              <Badge variant={values.importStandaloneCaCertificates ? "success" : "neutral"}>
                {values.importStandaloneCaCertificates ? "Enabled" : "Disabled"}
              </Badge>
            </ReviewDetail>
          </ReviewGroup>
        </>
      )}
      <ReviewGroup title="Details">
        <ReviewDetail label="Type">
          {PKI_DISCOVERY_TYPE_MAP[values.discoveryType].name}
        </ReviewDetail>
        <ReviewDetail label="Name">{values.name}</ReviewDetail>
        <ReviewDetail label="Schedule">{scheduleLabel}</ReviewDetail>
        <ReviewDetail label="Description">{values.description}</ReviewDetail>
      </ReviewGroup>
    </div>
  );
};
