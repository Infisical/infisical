import { faGlobe, faKey, faLock, faShieldHalved, faTags } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

import { Skeleton } from "@app/components/v2";
import { Badge, ButtonGroup } from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { CertRequestRequestData, TApprovalRequest } from "@app/hooks/api/approvalRequests";
import { useGetCertificateProfileById } from "@app/hooks/api/certificateProfiles";
import {
  certKeyAlgorithmToNameMap,
  EXTENDED_KEY_USAGES_OPTIONS,
  KEY_USAGES_OPTIONS
} from "@app/hooks/api/certificates/constants";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import { useGetCertificateRequest } from "@app/hooks/api/certificates/queries";

type Props = {
  request: TApprovalRequest;
};

const formatKeyUsageDisplay = (usage: string): string => {
  const option = KEY_USAGES_OPTIONS.find((opt) => opt.value === usage);
  return option?.label || usage;
};

const formatExtendedKeyUsageDisplay = (usage: string): string => {
  const option = EXTENDED_KEY_USAGES_OPTIONS.find((opt) => opt.value === usage);
  return option?.label || usage;
};

const formatKeyAlgorithm = (algorithm: string): string => {
  return certKeyAlgorithmToNameMap[algorithm as CertKeyAlgorithm] || algorithm;
};

const formatValidity = (ttl: string): string => {
  const match = ttl.match(/^(\d+)([dhmy])$/i);
  if (!match) return ttl;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const unitMap: Record<string, string> = {
    d: value === 1 ? "day" : "days",
    h: value === 1 ? "hour" : "hours",
    m: value === 1 ? "minute" : "minutes",
    y: value === 1 ? "year" : "years"
  };

  return `${value} ${unitMap[unit] || unit}`;
};

export const CertificateDetailsSection = ({ request }: Props) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const requestData = request.requestData.requestData as CertRequestRequestData;
  const certRequest = requestData.certificateRequest;

  const { data: profile, isPending: isProfileLoading } = useGetCertificateProfileById({
    profileId: requestData.profileId
  });

  // Fetch the actual certificate request record to get all fields (including subject info and basic constraints)
  const { data: certRequestDetails } = useGetCertificateRequest(requestData.certificateRequestId);

  const isInternalCa = profile?.certificateAuthority && !profile.certificateAuthority.isExternal;
  const caId = profile?.certificateAuthority?.id;

  const hasKeyUsages = certRequest?.keyUsages && certRequest.keyUsages.length > 0;
  const hasExtendedKeyUsages =
    certRequest?.extendedKeyUsages && certRequest.extendedKeyUsages.length > 0;

  const filteredAltNames =
    certRequest?.altNames?.filter(
      (san: { type: string; value: string }) => san.value !== certRequest?.commonName
    ) || [];
  const hasAltNames = filteredAltNames.length > 0;

  // Use certificate request details for subject info and basic constraints (fallback to approval request data)
  const organization = certRequestDetails?.organization || certRequest?.organization;
  const organizationalUnit =
    certRequestDetails?.organizationalUnit || certRequest?.organizationalUnit;
  const country = certRequestDetails?.country || certRequest?.country;
  const state = certRequestDetails?.state || certRequest?.state;
  const locality = certRequestDetails?.locality || certRequest?.locality;
  const domainComponents = certRequestDetails?.domainComponents || certRequest?.domainComponents;
  const hasDomainComponents = Boolean(domainComponents && domainComponents.length > 0);
  const basicConstraints = certRequestDetails?.basicConstraints || certRequest?.basicConstraints;
  const metadata = certRequestDetails?.metadata || [];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-lg font-medium text-foreground">
          Request for {certRequest?.altNames?.[0]?.value || certRequest?.commonName || "-"}
        </h2>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-container-hover text-sm font-medium text-foreground">
            {(request.requesterName || "U")
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {request.requesterName || "Unknown"}
            </p>
            <p className="text-sm text-muted">{request.requesterEmail}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-4 flex items-center gap-2 text-base font-medium text-foreground">
          <FontAwesomeIcon icon={faLock} className="text-sm text-muted" />
          Certificate Specifications
        </h3>

        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {certRequest?.keyAlgorithm && (
            <div>
              <p className="text-xs text-muted">Key Algorithm</p>
              <p className="mt-0.5 text-sm text-foreground">
                {formatKeyAlgorithm(certRequest.keyAlgorithm)}
              </p>
            </div>
          )}
          {certRequest?.signatureAlgorithm && (
            <div>
              <p className="text-xs text-muted">Signature Algorithm</p>
              <p className="mt-0.5 text-sm text-foreground">{certRequest.signatureAlgorithm}</p>
            </div>
          )}
          {certRequest?.validity?.ttl && (
            <div>
              <p className="text-xs text-muted">Validity</p>
              <p className="mt-0.5 text-sm text-foreground">
                {formatValidity(certRequest.validity.ttl)}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted">Certificate Authority</p>
            {isProfileLoading && <Skeleton className="mt-0.5 h-4 w-24" />}
            {!isProfileLoading && isInternalCa && caId && (
              <Badge variant="outline" asChild className="mt-1">
                <Link
                  to="/organizations/$orgId/projects/cert-manager/$projectId/ca/$caId"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id,
                    caId
                  }}
                >
                  {profile?.certificateAuthority?.name || "N/A"}
                  <ExternalLinkIcon />
                </Link>
              </Badge>
            )}
            {!isProfileLoading && !(isInternalCa && caId) && (
              <p className="mt-0.5 text-sm text-foreground">
                {profile?.certificateAuthority?.name || "N/A"}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted">Certificate Profile</p>
            <p className="mt-0.5 text-sm text-foreground">{requestData.profileName}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-4 flex items-center gap-2 text-base font-medium text-foreground">
          <FontAwesomeIcon icon={faGlobe} className="text-sm text-muted" />
          Subject Information
        </h3>

        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {certRequest?.commonName && (
            <div>
              <p className="text-xs text-muted">Common Name (CN)</p>
              <p className="mt-0.5 text-sm text-foreground">{certRequest.commonName}</p>
            </div>
          )}
          {organization && (
            <div>
              <p className="text-xs text-muted">Organization (O)</p>
              <p className="mt-0.5 text-sm text-foreground">{organization}</p>
            </div>
          )}
          {organizationalUnit && (
            <div>
              <p className="text-xs text-muted">Organizational Unit (OU)</p>
              <p className="mt-0.5 text-sm text-foreground">{organizationalUnit}</p>
            </div>
          )}
          {country && (
            <div>
              <p className="text-xs text-muted">Country (C)</p>
              <p className="mt-0.5 text-sm text-foreground">{country}</p>
            </div>
          )}
          {state && (
            <div>
              <p className="text-xs text-muted">State (ST)</p>
              <p className="mt-0.5 text-sm text-foreground">{state}</p>
            </div>
          )}
          {locality && (
            <div>
              <p className="text-xs text-muted">Locality (L)</p>
              <p className="mt-0.5 text-sm text-foreground">{locality}</p>
            </div>
          )}
        </div>

        {hasDomainComponents && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-3 text-xs text-muted">Domain Components (DC)</p>
            <div className="flex flex-wrap gap-2">
              {domainComponents!.map((dc) => (
                <span
                  key={dc}
                  className="rounded bg-container-hover px-2.5 py-1 text-sm text-foreground"
                >
                  {dc}
                </span>
              ))}
            </div>
          </div>
        )}

        {hasAltNames && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-3 text-xs text-muted">Subject Alternative Names (SANs)</p>
            <div className="flex flex-wrap gap-2">
              {filteredAltNames.map((san: { type: string; value: string }) => (
                <span
                  key={`${san.type}-${san.value}`}
                  className="rounded bg-container-hover px-2.5 py-1 text-sm text-foreground"
                >
                  {san.value}
                </span>
              ))}
            </div>
          </div>
        )}

        {!certRequest?.commonName &&
          !organization &&
          !organizationalUnit &&
          !country &&
          !state &&
          !locality &&
          !hasDomainComponents &&
          !hasAltNames && <p className="text-sm text-muted">No subject information specified</p>}
      </div>

      {basicConstraints?.isCA && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-4 flex items-center gap-2 text-base font-medium text-foreground">
            <FontAwesomeIcon icon={faShieldHalved} className="text-sm text-muted" />
            Basic Constraints
          </h3>

          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <div>
              <p className="text-xs text-muted">Certificate Authority</p>
              <p className="mt-0.5 text-sm text-foreground">Yes (CA Certificate)</p>
            </div>
            {basicConstraints.pathLength !== undefined && (
              <div>
                <p className="text-xs text-muted">Path Length</p>
                <p className="mt-0.5 text-sm text-foreground">{basicConstraints.pathLength}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {(hasKeyUsages || hasExtendedKeyUsages) && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-4 flex items-center gap-2 text-base font-medium text-foreground">
            <FontAwesomeIcon icon={faKey} className="text-sm text-muted" />
            Key Usages
          </h3>

          {hasKeyUsages && certRequest?.keyUsages && (
            <div className="mb-4">
              <p className="mb-3 text-xs text-muted">Key Usages</p>
              <div className="flex flex-wrap gap-2">
                {certRequest.keyUsages.map((usage: string) => (
                  <span
                    key={usage}
                    className="rounded bg-container-hover px-2.5 py-1 text-sm text-foreground"
                  >
                    {formatKeyUsageDisplay(usage)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {hasExtendedKeyUsages && certRequest?.extendedKeyUsages && (
            <div className={hasKeyUsages ? "border-t border-border pt-4" : ""}>
              <p className="mb-3 text-xs text-muted">Extended Key Usages</p>
              <div className="flex flex-wrap gap-2">
                {certRequest.extendedKeyUsages.map((usage: string) => (
                  <span
                    key={usage}
                    className="rounded bg-container-hover px-2.5 py-1 text-sm text-foreground"
                  >
                    {formatExtendedKeyUsageDisplay(usage)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-4 flex items-center gap-2 text-base font-medium text-foreground">
          <FontAwesomeIcon icon={faTags} className="text-sm text-muted" />
          Metadata
        </h3>
        {metadata.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {metadata.map((item: { key: string; value?: string }) =>
              item.value ? (
                <ButtonGroup className="max-w-full min-w-0" key={`${item.key}=${item.value}`}>
                  <Badge isTruncatable className="max-w-[12rem] shrink-0">
                    <span>{item.key}</span>
                  </Badge>
                  <Badge variant="outline" isTruncatable>
                    <span>{item.value}</span>
                  </Badge>
                </ButtonGroup>
              ) : (
                <Badge key={item.key} isTruncatable>
                  <span>{item.key}</span>
                </Badge>
              )
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">No metadata attached to this request.</p>
        )}
      </div>
    </div>
  );
};
