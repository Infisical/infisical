import { GenericFieldLabel } from "@app/components/secret-syncs";
import { Badge } from "@app/components/v3";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import {
  AwsSecretsManagerSyncMappingBehavior,
  TAwsSecretsManagerSync
} from "@app/hooks/api/secretSyncs/types/aws-secrets-manager-sync";

type Props = {
  secretSync: TAwsSecretsManagerSync;
};

export const AwsSecretsManagerSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  const awsRegion = AWS_REGIONS.find((r) => r.slug === destinationConfig.region);

  return (
    <>
      <GenericFieldLabel label="Region">
        {awsRegion?.name}
        <Badge className="ml-1" variant="neutral">
          {awsRegion?.slug}
        </Badge>
      </GenericFieldLabel>
      <GenericFieldLabel label="Mapping Behavior" className="capitalize">
        {destinationConfig.mappingBehavior}
      </GenericFieldLabel>
      {destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.ManyToOne && (
        <GenericFieldLabel label="Secret Name">{destinationConfig.secretName}</GenericFieldLabel>
      )}
    </>
  );
};
