import { GenericFieldLabel } from "@app/components/secret-syncs";
import { Badge } from "@app/components/v3";
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
      <GenericFieldLabel label="Region">
        {awsRegion?.name}
        <Badge className="ml-1" variant="neutral">
          {awsRegion?.slug}
        </Badge>
      </GenericFieldLabel>
      <GenericFieldLabel label="Path">{path}</GenericFieldLabel>
    </>
  );
};
