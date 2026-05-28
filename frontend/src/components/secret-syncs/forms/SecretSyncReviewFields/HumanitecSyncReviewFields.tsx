import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { HumanitecSyncScope } from "@app/hooks/api/secretSyncs/types/humanitec-sync";

export const HumanitecSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Humanitec }>();
  const orgId = watch("destinationConfig.org");
  const appId = watch("destinationConfig.app");
  const envId = watch("destinationConfig.env");
  const scope = watch("destinationConfig.scope");

  return (
    <>
      <Detail>
        <DetailLabel>Organization</DetailLabel>
        <DetailValue>{orgId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Application</DetailLabel>
        <DetailValue>{appId}</DetailValue>
      </Detail>
      {scope === HumanitecSyncScope.Environment && (
        <Detail>
          <DetailLabel>Environment</DetailLabel>
          <DetailValue>{envId}</DetailValue>
        </Detail>
      )}
    </>
  );
};
