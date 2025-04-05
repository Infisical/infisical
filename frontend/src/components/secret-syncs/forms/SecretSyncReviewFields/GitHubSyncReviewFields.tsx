import { ReactNode } from "react";
import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GitHubSyncScope, TGitHubSync } from "@app/hooks/api/secretSyncs/types/github-sync";

export const GitHubSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.GitHub }>();

  const config = watch("destinationConfig");

  let ScopeComponents: ReactNode;

  switch (config.scope) {
    case GitHubSyncScope.Repository:
      ScopeComponents = (
        <GenericFieldLabel label="Repository">
          {config.owner}/{config.repo}
        </GenericFieldLabel>
      );
      break;
    case GitHubSyncScope.Organization:
      ScopeComponents = (
        <>
          <GenericFieldLabel label="Organization">{config.org}</GenericFieldLabel>
          <GenericFieldLabel className="capitalize" label="Visibility">
            {config.visibility}
          </GenericFieldLabel>
        </>
      );
      break;
    case GitHubSyncScope.RepositoryEnvironment:
      ScopeComponents = (
        <>
          <GenericFieldLabel label="Repository">
            {config.owner}/{config.repo}
          </GenericFieldLabel>
          <GenericFieldLabel className="capitalize" label="Environment">
            {config.env}
          </GenericFieldLabel>
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
      <GenericFieldLabel className="capitalize" label="Scope">
        {config.scope.replace("-", " ")}
      </GenericFieldLabel>
      {ScopeComponents}
    </>
  );
};
