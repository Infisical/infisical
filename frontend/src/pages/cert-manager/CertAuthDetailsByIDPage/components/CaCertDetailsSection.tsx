import {
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { CaType, useGetCa } from "@app/hooks/api";
import { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";

type Props = {
  caId: string;
};

export const CaCertDetailsSection = ({ caId }: Props) => {
  const { data } = useGetCa({
    caId,
    type: CaType.INTERNAL
  });

  const ca = data as TInternalCertificateAuthority;

  if (!ca) {
    return <div />;
  }

  const hasAnyDetails =
    ca.configuration.commonName ||
    ca.configuration.organization ||
    ca.configuration.ou ||
    ca.configuration.country ||
    ca.configuration.province ||
    ca.configuration.locality;

  if (!hasAnyDetails) {
    return null;
  }

  return (
    <UnstableCard className="mt-4 w-full">
      <UnstableCardHeader className="border-b">
        <UnstableCardTitle>Certificate Details</UnstableCardTitle>
      </UnstableCardHeader>
      <UnstableCardContent>
        <DetailGroup>
          {ca.configuration.commonName && (
            <Detail>
              <DetailLabel>Common Name (CN)</DetailLabel>
              <DetailValue>{ca.configuration.commonName}</DetailValue>
            </Detail>
          )}

          {ca.configuration.organization && (
            <Detail>
              <DetailLabel>Organization (O)</DetailLabel>
              <DetailValue>{ca.configuration.organization}</DetailValue>
            </Detail>
          )}

          {ca.configuration.ou && (
            <Detail>
              <DetailLabel>Organizational Unit (OU)</DetailLabel>
              <DetailValue>{ca.configuration.ou}</DetailValue>
            </Detail>
          )}

          {ca.configuration.country && (
            <Detail>
              <DetailLabel>Country (C)</DetailLabel>
              <DetailValue>{ca.configuration.country}</DetailValue>
            </Detail>
          )}

          {ca.configuration.province && (
            <Detail>
              <DetailLabel>State/Province (ST)</DetailLabel>
              <DetailValue>{ca.configuration.province}</DetailValue>
            </Detail>
          )}

          {ca.configuration.locality && (
            <Detail>
              <DetailLabel>Locality (L)</DetailLabel>
              <DetailValue>{ca.configuration.locality}</DetailValue>
            </Detail>
          )}
        </DetailGroup>
      </UnstableCardContent>
    </UnstableCard>
  );
};
