import { ReactNode } from "react";
import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GiteaSyncScope, TGiteaSync } from "@app/hooks/api/secretSyncs/types/gitea-sync";

export const GiteaSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Gitea }>();

  const config = watch("destinationConfig");

  let ScopeComponents: ReactNode;

  switch (config.scope) {
    case GiteaSyncScope.Repository:
      ScopeComponents = (
        <Detail>
          <DetailLabel>Repository</DetailLabel>
          <DetailValue>
            {config.owner}/{config.repo}
          </DetailValue>
        </Detail>
      );
      break;
    case GiteaSyncScope.Organization:
      ScopeComponents = (
        <Detail>
          <DetailLabel>Organization</DetailLabel>
          <DetailValue>
            {config.org.fullName} ({config.org.name})
          </DetailValue>
        </Detail>
      );
      break;
    default:
      throw new Error(
        `Unhandled Gitea Sync Review Field Scope ${(config as TGiteaSync["destinationConfig"]).scope}`
      );
  }

  return (
    <>
      <Detail>
        <DetailLabel>Scope</DetailLabel>
        <DetailValue className="capitalize">{config.scope.replace("-", " ")}</DetailValue>
      </Detail>
      {ScopeComponents}
    </>
  );
};
