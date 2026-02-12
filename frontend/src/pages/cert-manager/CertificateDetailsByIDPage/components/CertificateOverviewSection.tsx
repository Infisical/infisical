/* eslint-disable no-nested-ternary */
import { Link, useParams } from "@tanstack/react-router";
import { format } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";

import { Tooltip } from "@app/components/v2";
import { CopyButton } from "@app/components/v2/CopyButton";
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
import { CertSource, CertStatus, useGetCertificateById } from "@app/hooks/api";

import {
  getCertSourceLabel,
  getCertValidUntilBadgeDetails
} from "../../CertificatesPage/components/CertificatesTable.utils";

type Props = {
  certificateId: string;
};

const formatDateUTC = (dateString: string) => {
  const date = new Date(dateString);
  return date.toUTCString().replace("GMT", "UTC");
};

const formatDateLocal = (dateString: string) => {
  return format(new Date(dateString), "EEE, dd MMM yyyy HH:mm:ss");
};

export const CertificateOverviewSection = ({ certificateId }: Props) => {
  const { orgId, projectId } = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/certificates/$certificateId"
  });
  const { data: certificateData, isLoading } = useGetCertificateById(certificateId);
  const certificate = certificateData?.certificate;

  if (isLoading) {
    return (
      <div className="flex w-full flex-col gap-5 lg:max-w-[24rem]">
        <UnstableCard>
          <UnstableCardContent className="flex items-center justify-center py-8">
            <p className="text-sm text-mineshaft-400">Loading...</p>
          </UnstableCardContent>
        </UnstableCard>
      </div>
    );
  }

  if (!certificate) {
    return null;
  }

  const { variant: expiryVariant, label: expiryLabel } = getCertValidUntilBadgeDetails(
    certificate.notAfter
  );

  const showCaLink = certificate.caId && certificate.caName && certificate.caType === "internal";

  return (
    <div className="flex w-full flex-col gap-5 lg:max-w-[24rem]">
      <UnstableCard>
        <UnstableCardHeader className="border-b">
          <UnstableCardTitle>Overview</UnstableCardTitle>
          <UnstableCardDescription>Certificate overview</UnstableCardDescription>
        </UnstableCardHeader>
        <UnstableCardContent>
          <DetailGroup>
            <Detail>
              <DetailLabel>Common Name</DetailLabel>
              <DetailValue>{certificate.commonName}</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Friendly Name</DetailLabel>
              <DetailValue>
                {certificate.friendlyName || <span className="text-muted">—</span>}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Status</DetailLabel>
              <DetailValue>
                {certificate.status === CertStatus.REVOKED ? (
                  <Badge variant="danger">Revoked</Badge>
                ) : (
                  <Badge variant={expiryVariant}>{expiryLabel}</Badge>
                )}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Serial Number</DetailLabel>
              <DetailValue className="flex items-center gap-2 font-mono text-xs">
                {certificate.serialNumber}
                <CopyButton value={certificate.serialNumber} size="xs" variant="plain" />
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Not Before</DetailLabel>
              <DetailValue>
                {certificate.notBefore ? (
                  <Tooltip
                    content={`${formatDateLocal(certificate.notBefore)} (Local)`}
                    position="right"
                  >
                    <span className="cursor-default">{formatDateUTC(certificate.notBefore)}</span>
                  </Tooltip>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Not After</DetailLabel>
              <DetailValue>
                {certificate.notAfter ? (
                  <Tooltip
                    content={`${formatDateLocal(certificate.notAfter)} (Local)`}
                    position="right"
                  >
                    <span className="cursor-default">{formatDateUTC(certificate.notAfter)}</span>
                  </Tooltip>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </DetailValue>
            </Detail>
          </DetailGroup>
        </UnstableCardContent>
      </UnstableCard>

      <UnstableCard>
        <UnstableCardHeader className="border-b">
          <UnstableCardTitle>Issuance</UnstableCardTitle>
          <UnstableCardDescription>
            Certificate authority and profile information
          </UnstableCardDescription>
        </UnstableCardHeader>
        <UnstableCardContent>
          <DetailGroup>
            <Detail>
              <DetailLabel>Certificate Authority</DetailLabel>
              <DetailValue>
                {showCaLink && (
                  <Link
                    to="/organizations/$orgId/projects/cert-manager/$projectId/ca/$caId"
                    params={{ orgId, projectId, caId: certificate.caId }}
                    className="inline-flex items-center gap-1 underline"
                  >
                    {certificate.caName}
                    <ExternalLinkIcon className="size-3.5 text-mineshaft-400" />
                  </Link>
                )}
                {!showCaLink &&
                  (certificate.caName || certificate.discoveryMetadata?.issuerCommonName || (
                    <span className="text-muted">—</span>
                  ))}
              </DetailValue>
            </Detail>
            {!certificate.caId && certificate.discoveryMetadata?.issuerOrganization && (
              <Detail>
                <DetailLabel>Issuer Organization</DetailLabel>
                <DetailValue>{certificate.discoveryMetadata.issuerOrganization}</DetailValue>
              </Detail>
            )}
            <Detail>
              <DetailLabel>Profile</DetailLabel>
              <DetailValue>
                {certificate.profileName || <span className="text-muted">—</span>}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Source</DetailLabel>
              <DetailValue>
                <Badge
                  variant={
                    certificate.source === CertSource.Discovered
                      ? "info"
                      : certificate.source === CertSource.Imported
                        ? "neutral"
                        : "project"
                  }
                >
                  {getCertSourceLabel(certificate.source ?? null)}
                </Badge>
              </DetailValue>
            </Detail>
            {certificate.renewedFromCertificateId && (
              <Detail>
                <DetailLabel>Renewed From</DetailLabel>
                <DetailValue>
                  <Link
                    to="/organizations/$orgId/projects/cert-manager/$projectId/certificates/$certificateId"
                    params={{
                      orgId,
                      projectId,
                      certificateId: certificate.renewedFromCertificateId
                    }}
                    className="inline-flex items-center gap-1 underline"
                  >
                    {certificate.commonName}
                    <ExternalLinkIcon className="size-3.5 text-mineshaft-400" />
                  </Link>
                </DetailValue>
              </Detail>
            )}
            {certificate.renewedByCertificateId && (
              <Detail>
                <DetailLabel>Renewed By</DetailLabel>
                <DetailValue>
                  <Link
                    to="/organizations/$orgId/projects/cert-manager/$projectId/certificates/$certificateId"
                    params={{
                      orgId,
                      projectId,
                      certificateId: certificate.renewedByCertificateId
                    }}
                    className="inline-flex items-center gap-1 underline"
                  >
                    {certificate.commonName}
                    <ExternalLinkIcon className="size-3.5 text-mineshaft-400" />
                  </Link>
                </DetailValue>
              </Detail>
            )}
          </DetailGroup>
        </UnstableCardContent>
      </UnstableCard>
    </div>
  );
};
