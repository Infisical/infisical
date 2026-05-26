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
import { TCertificateProfileWithDetails } from "@app/hooks/api/certificateProfiles";
import {
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  formatExtendedKeyUsage,
  formatKeyUsage
} from "@app/pages/cert-manager/PoliciesPage/components/CertificatePoliciesTab/shared/certificate-constants";

type Props = {
  profile: TCertificateProfileWithDetails;
};

export const ProfileDefaultsSection = ({ profile }: Props) => {
  const defaults = profile.defaults ?? null;

  const hasSubjectDefaults = Boolean(
    defaults?.commonName ||
      defaults?.organization ||
      defaults?.organizationalUnit ||
      defaults?.country ||
      defaults?.state ||
      defaults?.locality
  );

  const hasCryptoDefaults = Boolean(
    defaults?.keyAlgorithm ||
      defaults?.signatureAlgorithm ||
      defaults?.ttlDays ||
      (defaults?.keyUsages && defaults.keyUsages.length > 0) ||
      (defaults?.extendedKeyUsages && defaults.extendedKeyUsages.length > 0) ||
      defaults?.basicConstraints
  );

  if (!defaults || (!hasSubjectDefaults && !hasCryptoDefaults)) {
    return (
      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle>Defaults</CardTitle>
          <CardDescription>Values applied when issuing certificates</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-label">No defaults configured for this profile.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Defaults</CardTitle>
        <CardDescription>Values applied when issuing certificates</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          {defaults.ttlDays !== undefined && defaults.ttlDays !== null && (
            <Detail>
              <DetailLabel>TTL</DetailLabel>
              <DetailValue>{defaults.ttlDays} days</DetailValue>
            </Detail>
          )}

          {defaults.keyAlgorithm && (
            <Detail>
              <DetailLabel>Key Algorithm</DetailLabel>
              <DetailValue>
                <Badge variant="neutral">{defaults.keyAlgorithm}</Badge>
              </DetailValue>
            </Detail>
          )}

          {defaults.signatureAlgorithm && (
            <Detail>
              <DetailLabel>Signature Algorithm</DetailLabel>
              <DetailValue>
                <Badge variant="neutral">{defaults.signatureAlgorithm}</Badge>
              </DetailValue>
            </Detail>
          )}

          {defaults.keyUsages && defaults.keyUsages.length > 0 && (
            <Detail>
              <DetailLabel>Key Usages</DetailLabel>
              <DetailValue className="flex flex-wrap gap-1">
                {defaults.keyUsages.map((usage) => (
                  <Badge key={usage} variant="neutral">
                    {formatKeyUsage(usage as CertKeyUsageType)}
                  </Badge>
                ))}
              </DetailValue>
            </Detail>
          )}

          {defaults.extendedKeyUsages && defaults.extendedKeyUsages.length > 0 && (
            <Detail>
              <DetailLabel>Extended Key Usages</DetailLabel>
              <DetailValue className="flex flex-wrap gap-1">
                {defaults.extendedKeyUsages.map((usage) => (
                  <Badge key={usage} variant="neutral">
                    {formatExtendedKeyUsage(usage as CertExtendedKeyUsageType)}
                  </Badge>
                ))}
              </DetailValue>
            </Detail>
          )}

          {defaults.basicConstraints && (
            <>
              <Detail>
                <DetailLabel>Is CA</DetailLabel>
                <DetailValue>
                  <Badge variant={defaults.basicConstraints.isCA ? "success" : "neutral"}>
                    {defaults.basicConstraints.isCA ? "Yes" : "No"}
                  </Badge>
                </DetailValue>
              </Detail>
              {defaults.basicConstraints.pathLength !== undefined && (
                <Detail>
                  <DetailLabel>Max Path Length</DetailLabel>
                  <DetailValue>{defaults.basicConstraints.pathLength}</DetailValue>
                </Detail>
              )}
            </>
          )}

          {hasSubjectDefaults && (
            <>
              {defaults.commonName && (
                <Detail>
                  <DetailLabel>Common Name (CN)</DetailLabel>
                  <DetailValue>{defaults.commonName}</DetailValue>
                </Detail>
              )}

              {defaults.organization && (
                <Detail>
                  <DetailLabel>Organization (O)</DetailLabel>
                  <DetailValue>{defaults.organization}</DetailValue>
                </Detail>
              )}

              {defaults.organizationalUnit && (
                <Detail>
                  <DetailLabel>Organizational Unit (OU)</DetailLabel>
                  <DetailValue>{defaults.organizationalUnit}</DetailValue>
                </Detail>
              )}

              {defaults.country && (
                <Detail>
                  <DetailLabel>Country (C)</DetailLabel>
                  <DetailValue>{defaults.country}</DetailValue>
                </Detail>
              )}

              {defaults.state && (
                <Detail>
                  <DetailLabel>State/Province (ST)</DetailLabel>
                  <DetailValue>{defaults.state}</DetailValue>
                </Detail>
              )}

              {defaults.locality && (
                <Detail>
                  <DetailLabel>Locality (L)</DetailLabel>
                  <DetailValue>{defaults.locality}</DetailValue>
                </Detail>
              )}
            </>
          )}
        </DetailGroup>
      </CardContent>
    </Card>
  );
};
