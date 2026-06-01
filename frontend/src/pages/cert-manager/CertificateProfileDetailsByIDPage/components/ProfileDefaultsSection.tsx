import { KeyRoundIcon, ScrollTextIcon, ShieldCheckIcon, UserIcon } from "lucide-react";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailLabel,
  DetailValue,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
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

const SectionHeader = ({ icon, title }: { icon: React.ReactNode; title: string }) => (
  <h3 className="mb-4 flex items-center gap-2 text-base font-medium text-foreground">
    <span className="text-label [&>svg]:size-4">{icon}</span>
    {title}
  </h3>
);

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
    defaults?.keyAlgorithm || defaults?.signatureAlgorithm || defaults?.ttlDays
  );

  const hasKeyUsages = Boolean(
    (defaults?.keyUsages && defaults.keyUsages.length > 0) ||
      (defaults?.extendedKeyUsages && defaults.extendedKeyUsages.length > 0)
  );

  const hasBasicConstraints = Boolean(defaults?.basicConstraints);

  if (
    !defaults ||
    (!hasSubjectDefaults && !hasCryptoDefaults && !hasKeyUsages && !hasBasicConstraints)
  ) {
    return (
      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle>Defaults</CardTitle>
          <CardDescription>Values applied when issuing certificates</CardDescription>
        </CardHeader>
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No defaults configured</EmptyTitle>
              <EmptyDescription>
                This profile has no default values applied when issuing certificates.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  const sections: Array<{ id: string; node: React.ReactNode }> = [];

  if (hasCryptoDefaults) {
    sections.push({
      id: "cryptography",
      node: (
        <>
          <SectionHeader icon={<KeyRoundIcon />} title="Cryptography" />
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
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
          </div>
        </>
      )
    });
  }

  if (hasKeyUsages) {
    sections.push({
      id: "key-usages",
      node: (
        <>
          <SectionHeader icon={<ShieldCheckIcon />} title="Key Usages" />
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
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
          </div>
        </>
      )
    });
  }

  if (hasBasicConstraints && defaults.basicConstraints) {
    sections.push({
      id: "basic-constraints",
      node: (
        <>
          <SectionHeader icon={<ScrollTextIcon />} title="Basic Constraints" />
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
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
          </div>
        </>
      )
    });
  }

  if (hasSubjectDefaults) {
    sections.push({
      id: "subject",
      node: (
        <>
          <SectionHeader icon={<UserIcon />} title="Subject" />
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
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
          </div>
        </>
      )
    });
  }

  return (
    <Card className="w-full">
      <CardHeader className="border-b">
        <CardTitle>Defaults</CardTitle>
        <CardDescription>Values applied when issuing certificates</CardDescription>
      </CardHeader>
      <CardContent>
        {sections.map((section, idx) => (
          <div key={section.id} className={idx === 0 ? "" : "mt-6 border-t border-border pt-6"}>
            {section.node}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
