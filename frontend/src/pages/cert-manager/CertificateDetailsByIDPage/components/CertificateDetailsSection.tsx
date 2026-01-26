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
import { useGetCertificateById } from "@app/hooks/api";
import { camelCaseToSpaces, toTitleCase } from "@app/lib/fn/string";

type Props = {
  certificateId: string;
};

export const CertificateDetailsSection = ({ certificateId }: Props) => {
  const { data, isLoading } = useGetCertificateById(certificateId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        {["subject", "extensions", "crypto"].map((id) => (
          <UnstableCard key={id}>
            <UnstableCardContent className="flex items-center justify-center py-8">
              <p className="text-sm text-mineshaft-400">Loading...</p>
            </UnstableCardContent>
          </UnstableCard>
        ))}
      </div>
    );
  }

  if (!data?.certificate) {
    return null;
  }

  const { certificate } = data;

  // Parse SANs from the altNames or subjectAltNames string
  const getSanList = () => {
    if (certificate.altNames) {
      return certificate.altNames.split(",").map((s) => s.trim());
    }
    if (certificate.subjectAltNames) {
      return certificate.subjectAltNames.split(",").map((s) => s.trim());
    }
    return [];
  };
  const sanList = getSanList();

  return (
    <>
      {/* Subject Attributes Card */}
      <UnstableCard>
        <UnstableCardHeader className="border-b">
          <UnstableCardTitle>Subject Attributes</UnstableCardTitle>
          <UnstableCardDescription>Distinguished name attributes</UnstableCardDescription>
        </UnstableCardHeader>
        <UnstableCardContent>
          <DetailGroup>
            {certificate.subject && (
              <div className="grid grid-cols-2 gap-4">
                <DetailGroup>
                  <Detail>
                    <DetailLabel>Organization</DetailLabel>
                    <DetailValue>
                      {certificate.subject.organization || <span className="text-muted">—</span>}
                    </DetailValue>
                  </Detail>
                  <Detail>
                    <DetailLabel>Country</DetailLabel>
                    <DetailValue>
                      {certificate.subject.country || <span className="text-muted">—</span>}
                    </DetailValue>
                  </Detail>
                  <Detail>
                    <DetailLabel>Locality</DetailLabel>
                    <DetailValue>
                      {certificate.subject.locality || <span className="text-muted">—</span>}
                    </DetailValue>
                  </Detail>
                </DetailGroup>
                <DetailGroup>
                  <Detail>
                    <DetailLabel>Organizational Unit</DetailLabel>
                    <DetailValue>
                      {certificate.subject.organizationalUnit || (
                        <span className="text-muted">—</span>
                      )}
                    </DetailValue>
                  </Detail>
                  <Detail>
                    <DetailLabel>State</DetailLabel>
                    <DetailValue>
                      {certificate.subject.state || <span className="text-muted">—</span>}
                    </DetailValue>
                  </Detail>
                </DetailGroup>
              </div>
            )}
            <Detail>
              <DetailLabel>Subject Alternative Names</DetailLabel>
              <DetailValue>
                {sanList.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {sanList.map((san) => (
                      <Badge key={san} variant="neutral">
                        {san}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </DetailValue>
            </Detail>
          </DetailGroup>
        </UnstableCardContent>
      </UnstableCard>

      {/* Extensions Card */}
      <UnstableCard>
        <UnstableCardHeader className="border-b">
          <UnstableCardTitle>Extensions</UnstableCardTitle>
          <UnstableCardDescription>Certificate extensions and key usage</UnstableCardDescription>
        </UnstableCardHeader>
        <UnstableCardContent>
          <DetailGroup>
            <div className="grid grid-cols-2 gap-4">
              <Detail>
                <DetailLabel>Basic Constraints</DetailLabel>
                <DetailValue>
                  {certificate.basicConstraints
                    ? `CA:${certificate.basicConstraints.isCA ? "TRUE" : "FALSE"}`
                    : "—"}
                </DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Path Length</DetailLabel>
                <DetailValue>
                  {certificate.basicConstraints?.pathLength !== undefined
                    ? certificate.basicConstraints.pathLength
                    : "—"}
                </DetailValue>
              </Detail>
            </div>
            <Detail>
              <DetailLabel>Key Usage</DetailLabel>
              <DetailValue>
                {certificate.keyUsages && certificate.keyUsages.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {certificate.keyUsages.map((usage) => (
                      <Badge key={usage} variant="neutral">
                        {toTitleCase(camelCaseToSpaces(usage))}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Extended Key Usage</DetailLabel>
              <DetailValue>
                {certificate.extendedKeyUsages && certificate.extendedKeyUsages.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {certificate.extendedKeyUsages.map((usage) => (
                      <Badge key={usage} variant="neutral">
                        {toTitleCase(camelCaseToSpaces(usage))}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </DetailValue>
            </Detail>
          </DetailGroup>
        </UnstableCardContent>
      </UnstableCard>

      {/* Cryptographic Info Card */}
      <UnstableCard>
        <UnstableCardHeader className="border-b">
          <UnstableCardTitle>Cryptographic Info</UnstableCardTitle>
          <UnstableCardDescription>Algorithms and fingerprints</UnstableCardDescription>
        </UnstableCardHeader>
        <UnstableCardContent>
          <DetailGroup>
            <div className="grid grid-cols-2 gap-4">
              <Detail>
                <DetailLabel>Key Algorithm</DetailLabel>
                <DetailValue>
                  {certificate.keyAlgorithm || <span className="text-muted">—</span>}
                </DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Signature Algorithm</DetailLabel>
                <DetailValue>
                  {certificate.signatureAlgorithm || <span className="text-muted">—</span>}
                </DetailValue>
              </Detail>
            </div>
            {certificate.fingerprints && (
              <>
                <Detail>
                  <DetailLabel>SHA-256 Fingerprint</DetailLabel>
                  <DetailValue className="font-mono">
                    {certificate.fingerprints.sha256 || <span className="text-muted">—</span>}
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>SHA-1 Fingerprint</DetailLabel>
                  <DetailValue className="font-mono">
                    {certificate.fingerprints.sha1 || <span className="text-muted">—</span>}
                  </DetailValue>
                </Detail>
              </>
            )}
          </DetailGroup>
        </UnstableCardContent>
      </UnstableCard>
    </>
  );
};
