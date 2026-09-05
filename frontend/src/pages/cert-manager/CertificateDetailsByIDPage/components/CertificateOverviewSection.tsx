/* eslint-disable no-nested-ternary */
import { Link, useParams } from "@tanstack/react-router";
import { format } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";

import { getCertificateDisplayName } from "@app/components/utilities/certificateDisplayUtils";
import { Tooltip } from "@app/components/v2";
import { CopyButton } from "@app/components/v2/CopyButton";
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
import { CertSource, CertStatus, useGetCertificateById } from "@app/hooks/api";
import { CaType } from "@app/hooks/api/ca/enums";
import { TCertificateExternalMetadata } from "@app/hooks/api/certificates/types";

import {
  getCertificateDisplayStatus,
  getCertSourceLabel,
  getCertValidUntilBadgeDetails
} from "../../CertificatesPage/components/CertificatesTable.utils";
import { CertificateMetadataSection } from "./CertificateMetadataSection";

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

const getProviderReference = (metadata?: TCertificateExternalMetadata | null) => {
  if (!metadata) return null;

  switch (metadata.type) {
    case CaType.DIGICERT:
      return {
        provider: "DigiCert CertCentral",
        label: "Order ID",
        value: String(metadata.orderId)
      };
    case CaType.GODADDY:
      return { provider: "GoDaddy", label: "Certificate ID", value: metadata.certificateId };
    case CaType.AWS_ACM_PUBLIC_CA:
      return { provider: "AWS ACM Public CA", label: "Certificate ARN", value: metadata.arn };
    default:
      return null;
  }
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
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-sm text-mineshaft-400">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!certificate) {
    return null;
  }

  const { variant: expiryVariant, label: expiryLabel } = getCertValidUntilBadgeDetails(
    certificate.notAfter
  );
  const displayStatus = getCertificateDisplayStatus(certificate);

  const showCaLink = certificate.caId && certificate.caName && certificate.caType === "internal";
  const providerReference = getProviderReference(certificate.externalMetadata);

  return (
    <div className="flex w-full flex-col gap-5 lg:max-w-[24rem]">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Overview</CardTitle>
          <CardDescription>Certificate overview</CardDescription>
        </CardHeader>
        <CardContent>
          <DetailGroup>
            <Detail>
              <DetailLabel>Common Name</DetailLabel>
              <DetailValue>
                {certificate.commonName || <span className="text-muted">—</span>}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Certificate ID</DetailLabel>
              <DetailValue className="flex items-center gap-2 font-mono text-xs">
                {certificate.id}
                <CopyButton value={certificate.id} size="xs" variant="plain" />
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Status</DetailLabel>
              <DetailValue>
                {displayStatus.status === CertStatus.ACTIVE ? (
                  <Badge variant={expiryVariant}>{expiryLabel}</Badge>
                ) : (
                  <Badge variant={displayStatus.variant}>{displayStatus.label}</Badge>
                )}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Serial Number</DetailLabel>
              <DetailValue className="flex items-center gap-2 font-mono text-xs">
                {certificate.serialNumber.toUpperCase()}
                <CopyButton
                  value={certificate.serialNumber.toUpperCase()}
                  size="xs"
                  variant="plain"
                />
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Issuance</CardTitle>
          <CardDescription>Certificate authority and profile information</CardDescription>
        </CardHeader>
        <CardContent>
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
            {certificate.applicationId && certificate.applicationName && (
              <Detail>
                <DetailLabel>Application</DetailLabel>
                <DetailValue>
                  <Link
                    to="/organizations/$orgId/projects/cert-manager/$projectId/applications/$applicationName"
                    params={{
                      orgId,
                      projectId,
                      applicationName: certificate.applicationName
                    }}
                    className="inline-flex items-center gap-1 underline"
                  >
                    {certificate.applicationName}
                    <ExternalLinkIcon className="size-3.5 text-mineshaft-400" />
                  </Link>
                </DetailValue>
              </Detail>
            )}
            <Detail>
              <DetailLabel>Profile</DetailLabel>
              <DetailValue>
                {certificate.profileName || <span className="text-muted">—</span>}
              </DetailValue>
            </Detail>
            {providerReference && (
              <>
                <Detail>
                  <DetailLabel>Provider</DetailLabel>
                  <DetailValue>{providerReference.provider}</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>{providerReference.label}</DetailLabel>
                  <DetailValue className="font-mono">{providerReference.value}</DetailValue>
                </Detail>
              </>
            )}
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
                    {
                      getCertificateDisplayName(
                        certificate,
                        64,
                        certificate.renewedFromCertificateId
                      ).displayName
                    }
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
                    {
                      getCertificateDisplayName(certificate, 64, certificate.renewedByCertificateId)
                        .displayName
                    }
                    <ExternalLinkIcon className="size-3.5 text-mineshaft-400" />
                  </Link>
                </DetailValue>
              </Detail>
            )}
          </DetailGroup>
        </CardContent>
      </Card>

      <CertificateMetadataSection certificateId={certificateId} />
    </div>
  );
};
