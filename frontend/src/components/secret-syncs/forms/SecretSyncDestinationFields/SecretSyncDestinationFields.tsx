import { useFormContext } from "react-hook-form";

import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";
import { AwsParameterStoreSyncFields } from "./AwsParameterStoreSyncFields";
import { GitHubSyncFields } from "./GitHubSyncFields";

export const SecretSyncDestinationFields = () => {
  const { watch } = useFormContext<TSecretSyncForm>();

  const destination = watch("destination");

  switch (destination) {
    case SecretSync.AWSParameterStore:
      return <AwsParameterStoreSyncFields />;
    case SecretSync.GitHub:
      return <GitHubSyncFields />;
    default:
      throw new Error(`Unhandled Destination Config Field: ${destination}`);
  }
};
