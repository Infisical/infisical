import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { CLOUDFLARE_PAGES_VARIABLE_TYPE_LABELS } from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { CloudflarePagesVariableType } from "@app/hooks/api/secretSyncs/types/cloudflare-pages-sync";

export const CloudflarePagesSyncOptionsReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.CloudflarePages }>();
  const variableType =
    watch("destinationConfig.variableType") ?? CloudflarePagesVariableType.Secret;

  return (
    <Detail>
      <DetailLabel>Variable Type</DetailLabel>
      <DetailValue>{CLOUDFLARE_PAGES_VARIABLE_TYPE_LABELS[variableType]}</DetailValue>
    </Detail>
  );
};

export const CloudflarePagesSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.CloudflarePages }>();
  const projectName = watch("destinationConfig.projectName");
  const environment = watch("destinationConfig.environment");

  return (
    <>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{projectName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Environment</DetailLabel>
        <DetailValue>{environment}</DetailValue>
      </Detail>
    </>
  );
};
