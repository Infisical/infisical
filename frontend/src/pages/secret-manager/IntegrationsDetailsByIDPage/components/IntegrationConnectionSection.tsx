import { FormLabel } from "@app/components/v2";
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
        <div className="flex flex-col">
          <FormLabel className="text-mineshaft-300 text-sm font-medium" label="Organization" />
          <div className="text-mineshaft-300 text-sm">{integration?.owner || "-"}</div>
        </div>
        <div className="flex flex-col">
          <FormLabel className="text-mineshaft-300 text-sm font-medium" label="Project" />
          <div className="text-mineshaft-300 text-sm">{integration?.targetService || "-"}</div>
        </div>
        <div className="flex flex-col">
          <FormLabel
            className="text-mineshaft-300 text-sm font-medium"
            label="Target Environment"
          />
          <div className="text-mineshaft-300 text-sm">{integration?.targetEnvironment || "-"}</div>
        </div>
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
      <div className="flex flex-col">
        <FormLabel className="text-mineshaft-300 text-sm font-medium" label={formLabel()} />
        <div className="text-mineshaft-300 text-sm">{contents()}</div>
      </div>
    );
  };

  const targetEnvironmentDetails = () => {
    if (integration.integration === "bitbucket") {
      return (
        <div className="flex flex-col">
          <FormLabel className="text-mineshaft-300 text-sm font-medium" label="Workspace" />
          <div className="text-mineshaft-300 text-sm">
            {integration.targetEnvironment || integration.targetEnvironmentId}
          </div>
        </div>
      );
    }

    if (integration.integration === "octopus-deploy") {
      return (
        <div>
          <FormLabel className="text-mineshaft-300 text-sm font-medium" label="Space" />
          <div className="text-mineshaft-300 text-sm">{integration.targetEnvironment}</div>
        </div>
      );
    }

    if (
      ["vercel", "netlify", "railway", "gitlab", "teamcity"].includes(integration.integration) ||
      (integration.integration === "github" && integration.scope === "github-env")
    ) {
      return (
        <div className="flex flex-col">
          <FormLabel
            className="text-mineshaft-300 text-sm font-medium"
            label="Target Environment"
          />
          <div className="text-mineshaft-300 text-sm">
            {integration.targetEnvironment || integration.targetEnvironmentId}
          </div>
        </div>
      );
    }

    return null;
  };

  const generalIntegrationSpecificDetails = () => {
    if (integration.integration === "checkly" && integration.targetService) {
      return (
        <div>
          <FormLabel className="text-mineshaft-300 text-sm font-medium" label="Group" />
          <div className="text-mineshaft-300 text-sm">{integration.targetService}</div>
        </div>
      );
    }

    if (integration.integration === "circleci" && integration.owner) {
      return (
        <div>
          <FormLabel className="text-mineshaft-300 text-sm font-medium" label="Organization" />
          <div className="text-mineshaft-300 text-sm">{integration.owner}</div>
        </div>
      );
    }

    if (integration.integration === "terraform-cloud" && integration.targetService) {
      return (
        <div>
          <FormLabel className="text-mineshaft-300 text-sm font-medium" label="Category" />
          <div className="text-mineshaft-300 text-sm">{integration.targetService}</div>
        </div>
      );
    }

    if (integration.integration === "checkly" || integration.integration === "github") {
      return (
        <div>
          <FormLabel className="text-mineshaft-300 text-sm font-medium" label="Secret Suffix" />
          <div className="text-mineshaft-300 text-sm">
            {integration?.metadata?.secretSuffix || "-"}
          </div>
        </div>
      );
    }

    if (integration.integration === "bitbucket" && integration.targetServiceId) {
      return (
        <div>
          <FormLabel
            className="text-mineshaft-300 text-sm font-medium"
            label="Deployment Environment"
          />
          <div className="text-mineshaft-300 text-sm">{integration.targetService}</div>
        </div>
      );
    }

    if (integration.integration === "windmill" && integration.url) {
      return (
        <div>
          <FormLabel className="text-mineshaft-300 text-sm font-medium" label="Instance URL" />
          <div className="text-mineshaft-300 text-sm">{integration.url}</div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="border-mineshaft-600 bg-mineshaft-900 mt-4 rounded-lg border p-4">
      <div className="border-mineshaft-400 flex items-center justify-between border-b pb-4">
        <h3 className="text-mineshaft-100 text-lg font-medium">Connection</h3>
      </div>

      <div className="mt-4">
        <FormLabel className="my-2" label="Source" />

        <div className="border-mineshaft-700 bg-mineshaft-800 space-y-2 rounded-lg border p-2">
          <div className="flex flex-col">
            <FormLabel className="text-mineshaft-300 text-sm font-medium" label="Environment" />
            <div className="text-mineshaft-300 text-sm">{integration.environment.name}</div>
          </div>
          <div className="flex flex-col">
            <FormLabel className="text-mineshaft-300 text-sm font-medium" label="Secret Path" />
            <div className="text-mineshaft-300 text-sm">{integration.secretPath}</div>
          </div>
        </div>

        <FormLabel className="my-2" label="Destination" />
        <div className="border-mineshaft-700 bg-mineshaft-800 space-y-2 rounded-lg border p-2">
          <FormLabel className="text-mineshaft-300 text-sm font-medium" label="Platform" />
          <div className="text-mineshaft-300 text-sm">
            {integrationSlugNameMapping?.[integration.integration]}
          </div>

          {specifcQoveryDetails()}
          {isNotAwsManagerOneToOneDetails()}
          {targetEnvironmentDetails()}
          {generalIntegrationSpecificDetails()}
        </div>
      </div>
    </div>
  );
};
