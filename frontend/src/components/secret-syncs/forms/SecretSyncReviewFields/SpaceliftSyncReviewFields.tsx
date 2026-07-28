import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { SpaceliftConfigType } from "@app/hooks/api/secretSyncs/types/spacelift-sync";

export const SpaceliftSyncOptionsReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Spacelift }>();

  const [{ writeOnly }] = watch(["syncOptions"]);

  return (
    <Detail>
      <DetailLabel>Mark as Secret</DetailLabel>
      <DetailValue>
        <Badge variant={writeOnly ? "success" : "neutral"}>
          {writeOnly ? "Enabled" : "Disabled"}
        </Badge>
      </DetailValue>
    </Detail>
  );
};

export const SpaceliftSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Spacelift }>();
  const contextName = watch("destinationConfig.contextName");
  const contextId = watch("destinationConfig.contextId");
  const configType = watch("destinationConfig.configType");
  const mountPath = watch("destinationConfig.mountPath");

  return (
    <>
      <Detail>
        <DetailLabel>Context</DetailLabel>
        <DetailValue>{contextName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Context ID</DetailLabel>
        <DetailValue>{contextId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Config Type</DetailLabel>
        <DetailValue>
          {configType === SpaceliftConfigType.FileMount
            ? "File Mount (.env)"
            : "Environment Variables"}
        </DetailValue>
      </Detail>
      {configType === SpaceliftConfigType.FileMount && mountPath && (
        <Detail>
          <DetailLabel>File Path</DetailLabel>
          <DetailValue>{mountPath}</DetailValue>
        </Detail>
      )}
    </>
  );
};
