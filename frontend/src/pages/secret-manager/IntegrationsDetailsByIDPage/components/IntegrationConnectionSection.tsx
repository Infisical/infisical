import { Detail, DetailLabel } from "@app/components/v3";
import { CircleCiScope } from "@app/hooks/api/integrationAuth/types";
import { IntegrationMappingBehavior, TIntegrationWithEnv } from "@app/hooks/api/integrations/types";

import { integrationSlugNameMapping } from "../IntegrationsDetailsByIDPage.utils";

type Props = {
  integration: TIntegrationWithEnv;
};

export const IntegrationConnectionSection = ({ integration }: Props) => {
  const specifcQoveryDetails = () => {
    if (integration.integration !== "qovery") return null;

    return (
      <div className="flex flex-row">
        <Detail>
          <DetailLabel>Organization</DetailLabel>
          <div className="text-sm text-label">{integration?.owner || "-"}</div>
        </Detail>
        <Detail>
          <DetailLabel>Project</DetailLabel>
          <div className="text-sm text-label">{integration?.targetService || "-"}</div>
        </Detail>
        <Detail>
          <DetailLabel>Target Environment</DetailLabel>
          <div className="text-sm text-label">{integration?.targetEnvironment || "-"}</div>
        </Detail>
      </div>
    );
  };

  const isNotAwsManagerOneToOneDetails = () => {
    const isAwsSecretManagerOneToOne =
      integration.integration === "aws-secret-manager" &&
      integration.metadata?.mappingBehavior === IntegrationMappingBehavior.ONE_TO_ONE;

    if (isAwsSecretManagerOneToOne) {
      return null;
    }

    const formLabel = () => {
      switch (integration.integration) {
        case "qovery":
          return integration.scope;
        case "circleci":
          if (integration.scope === CircleCiScope.Context) {
            return "Context";
          }

          return "Project";
        case "terraform-cloud":
          return "Project";
        case "aws-secret-manager":
          return "Secret";
        case "aws-parameter-store":
        case "rundeck":
          return "Path";
        case "bitbucket":
          return "Repository";
        case "octopus-deploy":
          return "Project";
        case "github":
          if (["github-env", "github-repo"].includes(integration.scope!)) {
            return "Repository";
          }
          return "Organization";

        default:
          return "App";
      }
    };

    const contents = () => {
      switch (integration.integration) {
        case "hashicorp-vault":
          return `${integration.app} - path: ${integration.path}`;
        case "github":
          if (integration.scope === "github-org") {
            return `${integration.owner}`;
          }
          return `${integration.owner}/${integration.app}`;
        case "aws-parameter-store":
        case "rundeck":
          return `${integration.path}`;

        default:
          return `${integration.app}`;
      }
    };

    return (
      <Detail>
        <DetailLabel>{formLabel()}</DetailLabel>
        <div className="text-sm text-label">{contents()}</div>
      </Detail>
    );
  };

  const targetEnvironmentDetails = () => {
    if (integration.integration === "bitbucket") {
      return (
        <Detail>
          <DetailLabel>Workspace</DetailLabel>
          <div className="text-sm text-label">
            {integration.targetEnvironment || integration.targetEnvironmentId}
          </div>
        </Detail>
      );
    }

    if (integration.integration === "octopus-deploy") {
      return (
        <Detail>
          <DetailLabel>Space</DetailLabel>
          <div className="text-sm text-label">{integration.targetEnvironment}</div>
        </Detail>
      );
    }

    if (
      ["vercel", "netlify", "railway", "gitlab", "teamcity"].includes(integration.integration) ||
      (integration.integration === "github" && integration.scope === "github-env")
    ) {
      return (
        <Detail>
          <DetailLabel>Target Environment</DetailLabel>
          <div className="text-sm text-label">
            {integration.targetEnvironment || integration.targetEnvironmentId}
          </div>
        </Detail>
      );
    }

    return null;
  };

  const generalIntegrationSpecificDetails = () => {
    if (integration.integration === "checkly" && integration.targetService) {
      return (
        <Detail>
          <DetailLabel>Group</DetailLabel>
          <div className="text-sm text-label">{integration.targetService}</div>
        </Detail>
      );
    }

    if (integration.integration === "circleci" && integration.owner) {
      return (
        <Detail>
          <DetailLabel>Organization</DetailLabel>
          <div className="text-sm text-label">{integration.owner}</div>
        </Detail>
      );
    }

    if (integration.integration === "terraform-cloud" && integration.targetService) {
      return (
        <Detail>
          <DetailLabel>Category</DetailLabel>
          <div className="text-sm text-label">{integration.targetService}</div>
        </Detail>
      );
    }

    if (integration.integration === "checkly" || integration.integration === "github") {
      return (
        <Detail>
          <DetailLabel>Secret Suffix</DetailLabel>
          <div className="text-sm text-label">{integration?.metadata?.secretSuffix || "-"}</div>
        </Detail>
      );
    }

    if (integration.integration === "bitbucket" && integration.targetServiceId) {
      return (
        <Detail>
          <DetailLabel>Deployment Environment</DetailLabel>
          <div className="text-sm text-label">{integration.targetService}</div>
        </Detail>
      );
    }

    if (integration.integration === "windmill" && integration.url) {
      return (
        <Detail>
          <DetailLabel>Instance URL</DetailLabel>
          <div className="text-sm text-label">{integration.url}</div>
        </Detail>
      );
    }

    return null;
  };

  return (
    <div className="mt-4 rounded-lg border border-border-control bg-surface-base p-4">
      <div className="flex items-center justify-between border-b border-border-emphasis pb-4">
        <h3 className="text-lg font-normal text-foreground">Connection</h3>
      </div>

      <div className="mt-4">
        <DetailLabel className="my-2">Source</DetailLabel>

        <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-raised p-2">
          <Detail>
            <DetailLabel>Environment</DetailLabel>
            <div className="text-sm text-label">{integration.environment.name}</div>
          </Detail>
          <Detail>
            <DetailLabel>Secret Path</DetailLabel>
            <div className="text-sm text-label">{integration.secretPath}</div>
          </Detail>
        </div>

        <DetailLabel className="my-2">Destination</DetailLabel>
        <div className="space-y-2 rounded-lg border border-border-subtle bg-surface-raised p-2">
          <Detail>
            <DetailLabel>Platform</DetailLabel>
            <div className="text-sm text-label">
              {integrationSlugNameMapping?.[integration.integration]}
            </div>
          </Detail>

          {specifcQoveryDetails()}
          {isNotAwsManagerOneToOneDetails()}
          {targetEnvironmentDetails()}
          {generalIntegrationSpecificDetails()}
        </div>
      </div>
    </div>
  );
};
