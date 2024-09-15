import { integrationSlugNameMapping } from "public/data/frequentConstants";

import { FormLabel } from "@app/components/v2";
import { IntegrationMappingBehavior, TIntegrationWithEnv } from "@app/hooks/api/integrations/types";

type Props = {
  integration: TIntegrationWithEnv;
};

export const IntegrationConnectionSection = ({ integration }: Props) => {
  const specifcQoveryDetails = () => {
    if (integration.integration !== "qovery") return null;

    return (
      <div className="flex flex-row">
        <div className="flex flex-col">
          <FormLabel className="text-sm font-semibold text-mineshaft-300" label="Organization" />
          <div className="text-sm text-mineshaft-300">{integration?.owner || "-"}</div>
        </div>
        <div className="flex flex-col">
          <FormLabel className="text-sm font-semibold text-mineshaft-300" label="Project" />
          <div className="text-sm text-mineshaft-300">{integration?.targetService || "-"}</div>
        </div>
        <div className="flex flex-col">
          <FormLabel
            className="text-sm font-semibold text-mineshaft-300"
            label="Target Environment"
          />
          <div className="text-sm text-mineshaft-300">{integration?.targetEnvironment || "-"}</div>
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
        case "terraform-cloud":
          return "Project";
        case "aws-secret-manager":
          return "Secret";
        case "aws-parameter-store":
        case "rundeck":
          return "Path";
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
        <FormLabel className="text-sm font-semibold text-mineshaft-300" label={formLabel()} />
        <div className="text-sm text-mineshaft-300">{contents()}</div>
      </div>
    );
  };

  const targetEnvironmentDetails = () => {
    if (
      ["vercel", "netlify", "railway", "gitlab", "teamcity", "bitbucket"].includes(
        integration.integration
      ) ||
      (integration.integration === "github" && integration.scope === "github-env")
    ) {
      return (
        <div className="flex flex-col">
          <FormLabel
            className="text-sm font-semibold text-mineshaft-300"
            label="Target Environment"
          />
          <div className="text-sm text-mineshaft-300">
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
          <FormLabel className="text-sm font-semibold text-mineshaft-300" label="Group" />
          <div className="text-sm text-mineshaft-300">{integration.targetService}</div>
        </div>
      );
    }

    if (integration.integration === "circleci" && integration.owner) {
      return (
        <div>
          <FormLabel className="text-sm font-semibold text-mineshaft-300" label="Organization" />
          <div className="text-sm text-mineshaft-300">{integration.owner}</div>
        </div>
      );
    }

    if (integration.integration === "terraform-cloud" && integration.targetService) {
      return (
        <div>
          <FormLabel className="text-sm font-semibold text-mineshaft-300" label="Category" />
          <div className="text-sm text-mineshaft-300">{integration.targetService}</div>
        </div>
      );
    }

    if (integration.integration === "checkly" || integration.integration === "github") {
      return (
        <div>
          <FormLabel className="text-sm font-semibold text-mineshaft-300" label="Secret Suffix" />
          <div className="text-sm text-mineshaft-300">
            {integration?.metadata?.secretSuffix || "-"}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="mt-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Connection</h3>
      </div>

      <div className="mt-4">
        <FormLabel className="my-2" label="Source" />

        <div className="space-y-2 rounded-lg border border-mineshaft-700 bg-mineshaft-800 p-2">
          <div className="flex flex-col">
            <FormLabel className="text-sm font-semibold text-mineshaft-300" label="Environment" />
            <div className="text-sm text-mineshaft-300">{integration.environment.name}</div>
          </div>
          <div className="flex flex-col">
            <FormLabel className="text-sm font-semibold text-mineshaft-300" label="Secret Path" />
            <div className="text-sm text-mineshaft-300">{integration.secretPath}</div>
          </div>
        </div>

        <FormLabel className="my-2" label="Destination" />
        <div className="space-y-2 rounded-lg border border-mineshaft-700 bg-mineshaft-800 p-2">
          <FormLabel className="text-sm font-semibold text-mineshaft-300" label="Platform" />
          <div className="text-sm text-mineshaft-300">
            {integrationSlugNameMapping[integration.integration]}
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
