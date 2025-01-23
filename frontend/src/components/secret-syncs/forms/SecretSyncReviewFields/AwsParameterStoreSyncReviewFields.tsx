import { useFormContext } from "react-hook-form";

import { SecretSyncLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge } from "@app/components/v2";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AwsParameterStoreSyncReviewFields = () => {
  const { watch } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AWSParameterStore }
  >();

  const [region, path] = watch(["destinationConfig.region", "destinationConfig.path"]);

  const awsRegion = AWS_REGIONS.find((r) => r.slug === region);

  return (
    <>
      <SecretSyncLabel label="Region">
        {awsRegion?.name}
        <Badge className="ml-1" variant="success">
          {awsRegion?.slug}{" "}
        </Badge>
      </SecretSyncLabel>
      <SecretSyncLabel label="Path">{path}</SecretSyncLabel>
    </>
  );
};
