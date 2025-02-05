import { useFormContext } from "react-hook-form";

import { SecretSyncLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge } from "@app/components/v2";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { AwsSecretsManagerSyncMappingBehavior } from "@app/hooks/api/secretSyncs/types/aws-secrets-manager-sync";

export const AwsSecretsManagerSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AWSSecretsManager }
  >();

  const [region, mappingBehavior, secretName] = watch([
    "destinationConfig.region",
    "destinationConfig.mappingBehavior",
    "destinationConfig.secretName"
  ]);

  const awsRegion = AWS_REGIONS.find((r) => r.slug === region);

  return (
    <>
      <SecretSyncLabel label="Region">
        {awsRegion?.name}
        <Badge className="ml-1" variant="success">
          {awsRegion?.slug}{" "}
        </Badge>
      </SecretSyncLabel>
      <SecretSyncLabel className="capitalize" label="Mapping Behavior">
        {mappingBehavior}
      </SecretSyncLabel>
      {mappingBehavior === AwsSecretsManagerSyncMappingBehavior.ManyToOne && (
        <SecretSyncLabel label="Secret Name">{secretName}</SecretSyncLabel>
      )}
    </>
  );
};
