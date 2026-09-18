import { ReactNode } from "react";
import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GitHubSyncScope, TGitHubSync } from "@app/hooks/api/secretSyncs/types/github-sync";

export const GitHubSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.GitHub }>();

  const config = watch("destinationConfig");

  let ScopeComponents: ReactNode;

  switch (config.scope) {
    case GitHubSyncScope.Repository:
      ScopeComponents = (
        <Detail>
          <DetailLabel>Repository</DetailLabel>
          <DetailValue>
            {config.owner}/{config.repo}
          </DetailValue>
        </Detail>
      );
      break;
    case GitHubSyncScope.Organization:
      ScopeComponents = (
        <>
          <Detail>
            <DetailLabel>Organization</DetailLabel>
            <DetailValue>{config.org}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Visibility</DetailLabel>
            <DetailValue className="capitalize">{config.visibility}</DetailValue>
          </Detail>
        </>
      );
      break;
    case GitHubSyncScope.RepositoryEnvironment:
      ScopeComponents = (
        <>
          <Detail>
            <DetailLabel>Repository</DetailLabel>
            <DetailValue>
              {config.owner}/{config.repo}
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Environment</DetailLabel>
            <DetailValue className="capitalize">{config.env}</DetailValue>
          </Detail>
        </>
      );

      break;
    default:
      throw new Error(
        `Unhandled GitHub Sync Review Field Scope ${(config as TGitHubSync["destinationConfig"]).scope}`
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
