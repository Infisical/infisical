import { faGlobe, faKey, faLock, faShieldHalved } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

import { Skeleton } from "@app/components/v2";
import { Badge } from "@app/components/v3";
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
    m: value === 1 ? "month" : "months",
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
  const { data: certRequestDetails } = useGetCertificateRequest(
    requestData.certificateRequestId,
    currentProject?.slug || ""
  );

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
  const basicConstraints = certRequestDetails?.basicConstraints || certRequest?.basicConstraints;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <h2 className="text-lg font-medium text-mineshaft-100">
          Request for {certRequest?.altNames?.[0]?.value || certRequest?.commonName || "-"}
        </h2>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-mineshaft-700 text-sm font-medium text-mineshaft-200">
            {(request.requesterName || "U")
              .split(" ")
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-mineshaft-100">
              {request.requesterName || "Unknown"}
            </p>
            <p className="text-sm text-mineshaft-400">{request.requesterEmail}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <h3 className="mb-4 flex items-center gap-2 text-base font-medium text-mineshaft-100">
          <FontAwesomeIcon icon={faLock} className="text-sm text-mineshaft-400" />
          Certificate Specifications
        </h3>

        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {certRequest?.keyAlgorithm && (
            <div>
              <p className="text-xs text-mineshaft-400">Key Algorithm</p>
              <p className="mt-0.5 text-sm text-mineshaft-100">
                {formatKeyAlgorithm(certRequest.keyAlgorithm)}
              </p>
            </div>
          )}
          {certRequest?.signatureAlgorithm && (
            <div>
              <p className="text-xs text-mineshaft-400">Signature Algorithm</p>
              <p className="mt-0.5 text-sm text-mineshaft-100">{certRequest.signatureAlgorithm}</p>
            </div>
          )}
          {certRequest?.validity?.ttl && (
            <div>
              <p className="text-xs text-mineshaft-400">Validity</p>
              <p className="mt-0.5 text-sm text-mineshaft-100">
                {formatValidity(certRequest.validity.ttl)}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs text-mineshaft-400">Certificate Authority</p>
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
              <p className="mt-0.5 text-sm text-mineshaft-100">
                {profile?.certificateAuthority?.name || "N/A"}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-mineshaft-400">Certificate Profile</p>
            <p className="mt-0.5 text-sm text-mineshaft-100">{requestData.profileName}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <h3 className="mb-4 flex items-center gap-2 text-base font-medium text-mineshaft-100">
          <FontAwesomeIcon icon={faGlobe} className="text-sm text-mineshaft-400" />
          Subject Information
        </h3>

        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {certRequest?.commonName && (
            <div>
              <p className="text-xs text-mineshaft-400">Common Name (CN)</p>
              <p className="mt-0.5 text-sm text-mineshaft-100">{certRequest.commonName}</p>
            </div>
          )}
          {organization && (
            <div>
              <p className="text-xs text-mineshaft-400">Organization (O)</p>
              <p className="mt-0.5 text-sm text-mineshaft-100">{organization}</p>
            </div>
          )}
          {organizationalUnit && (
            <div>
              <p className="text-xs text-mineshaft-400">Organizational Unit (OU)</p>
              <p className="mt-0.5 text-sm text-mineshaft-100">{organizationalUnit}</p>
            </div>
          )}
          {country && (
            <div>
              <p className="text-xs text-mineshaft-400">Country (C)</p>
              <p className="mt-0.5 text-sm text-mineshaft-100">{country}</p>
            </div>
          )}
          {state && (
            <div>
              <p className="text-xs text-mineshaft-400">State (ST)</p>
              <p className="mt-0.5 text-sm text-mineshaft-100">{state}</p>
            </div>
          )}
          {locality && (
            <div>
              <p className="text-xs text-mineshaft-400">Locality (L)</p>
              <p className="mt-0.5 text-sm text-mineshaft-100">{locality}</p>
            </div>
          )}
        </div>

        {hasAltNames && (
          <div className="mt-4 border-t border-mineshaft-600 pt-4">
            <p className="mb-3 text-xs text-mineshaft-400">Subject Alternative Names (SANs)</p>
            <div className="flex flex-wrap gap-2">
              {filteredAltNames.map((san: { type: string; value: string }) => (
                <span
                  key={`${san.type}-${san.value}`}
                  className="rounded bg-mineshaft-700 px-2.5 py-1 text-sm text-mineshaft-200"
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
          !hasAltNames && (
            <p className="text-sm text-mineshaft-400">No subject information specified</p>
          )}
      </div>

      {basicConstraints?.isCA && (
        <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <h3 className="mb-4 flex items-center gap-2 text-base font-medium text-mineshaft-100">
            <FontAwesomeIcon icon={faShieldHalved} className="text-sm text-mineshaft-400" />
            Basic Constraints
          </h3>

          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <div>
              <p className="text-xs text-mineshaft-400">Certificate Authority</p>
              <p className="mt-0.5 text-sm text-mineshaft-100">Yes (CA Certificate)</p>
            </div>
            {basicConstraints.pathLength !== undefined && (
              <div>
                <p className="text-xs text-mineshaft-400">Path Length</p>
                <p className="mt-0.5 text-sm text-mineshaft-100">{basicConstraints.pathLength}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {(hasKeyUsages || hasExtendedKeyUsages) && (
        <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <h3 className="mb-4 flex items-center gap-2 text-base font-medium text-mineshaft-100">
            <FontAwesomeIcon icon={faKey} className="text-sm text-mineshaft-400" />
            Key Usages
          </h3>

          {hasKeyUsages && certRequest?.keyUsages && (
            <div className="mb-4">
              <p className="mb-3 text-xs text-mineshaft-400">Key Usages</p>
              <div className="flex flex-wrap gap-2">
                {certRequest.keyUsages.map((usage: string) => (
                  <span
                    key={usage}
                    className="rounded bg-mineshaft-700 px-2.5 py-1 text-sm text-mineshaft-200"
                  >
                    {formatKeyUsageDisplay(usage)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {hasExtendedKeyUsages && certRequest?.extendedKeyUsages && (
            <div className={hasKeyUsages ? "border-t border-mineshaft-600 pt-4" : ""}>
              <p className="mb-3 text-xs text-mineshaft-400">Extended Key Usages</p>
              <div className="flex flex-wrap gap-2">
                {certRequest.extendedKeyUsages.map((usage: string) => (
                  <span
                    key={usage}
                    className="rounded bg-mineshaft-700 px-2.5 py-1 text-sm text-mineshaft-200"
                  >
                    {formatExtendedKeyUsageDisplay(usage)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
