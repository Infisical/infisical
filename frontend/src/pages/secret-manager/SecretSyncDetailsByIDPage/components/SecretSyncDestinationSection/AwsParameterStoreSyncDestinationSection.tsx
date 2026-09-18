import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import { TAwsParameterStoreSync } from "@app/hooks/api/secretSyncs/types/aws-parameter-store-sync";

type Props = {
  secretSync: TAwsParameterStoreSync;
};

export const AwsParameterStoreSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { path, region }
  } = secretSync;

  const awsRegion = AWS_REGIONS.find((r) => r.slug === region);

  return (
    <>
      <Detail>
        <DetailLabel>Region</DetailLabel>
        <DetailValue>
          {awsRegion?.name}
          <Badge className="ml-1" variant="neutral">
            {awsRegion?.slug}
          </Badge>
        </DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Path</DetailLabel>
        <DetailValue>{path}</DetailValue>
      </Detail>
    </>
  );
};
