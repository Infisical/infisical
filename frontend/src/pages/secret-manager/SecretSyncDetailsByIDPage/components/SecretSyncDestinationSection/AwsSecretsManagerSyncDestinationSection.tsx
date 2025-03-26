import { SecretSyncLabel } from "@app/components/secret-syncs";
import { Badge } from "@app/components/v2";
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
      <SecretSyncLabel label="Region">
        {awsRegion?.name}
        <Badge className="ml-1" variant="success">
          {awsRegion?.slug}{" "}
        </Badge>
      </SecretSyncLabel>
      <SecretSyncLabel label="Mapping Behavior" className="capitalize">
        {destinationConfig.mappingBehavior}
      </SecretSyncLabel>
      {destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.ManyToOne && (
        <SecretSyncLabel label="Secret Name">{destinationConfig.secretName}</SecretSyncLabel>
      )}
    </>
  );
};
