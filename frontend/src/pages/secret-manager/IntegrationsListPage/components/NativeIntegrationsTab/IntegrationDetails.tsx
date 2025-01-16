import { FormLabel } from "@app/components/v2";
import { CircleCiScope } from "@app/hooks/api/integrationAuth/types";
import { IntegrationMappingBehavior, TIntegration } from "@app/hooks/api/integrations/types";

type Props = {
  integration: TIntegration;
};

const FIELD_CLASSNAME =
  "truncate rounded-md border border-mineshaft-700 bg-mineshaft-900 px-3 py-2 font-inter text-sm text-bunker-200";

export const getIntegrationDestination = (integration: TIntegration) =>
  (integration.integration === "hashicorp-vault" &&
    `${integration.app} - path: ${integration.path}`) ||
  (integration.scope === "github-org" && `${integration.owner}`) ||
  (["aws-parameter-store", "rundeck"].includes(integration.integration) && `${integration.path}`) ||
  (integration.scope?.startsWith("github-") && `${integration.owner}/${integration.app}`) ||
  integration.app ||
  "-";

export const IntegrationDetails = ({ integration }: Props) => {
  return (
    <div className="flex flex-col gap-2 p-2">
      {integration.integration === "octopus-deploy" && (
        <div>
          <FormLabel label="Space" />
          <div className={FIELD_CLASSNAME}>
            {integration.targetEnvironment || integration.targetEnvironmentId}
          </div>
        </div>
      )}
      {integration.integration === "qovery" && (
        <>
          <div>
            <FormLabel label="Org" />
            <div className={FIELD_CLASSNAME}>{integration?.owner || "-"}</div>
          </div>
          <div>
            <FormLabel label="Project" />
            <div className={FIELD_CLASSNAME}>{integration?.targetService || "-"}</div>
          </div>
          <div>
            <FormLabel label="Env" />
            <div className={FIELD_CLASSNAME}>{integration?.targetEnvironment || "-"}</div>
          </div>
        </>
      )}
      {!(
        integration.integration === "aws-secret-manager" &&
        integration.metadata?.mappingBehavior === IntegrationMappingBehavior.ONE_TO_ONE
      ) && (
        <div>
          <FormLabel
            label={
              (integration.integration === "qovery" && integration?.scope) ||
              (integration.integration === "circleci" &&
                (integration.scope === CircleCiScope.Context ? "Context" : "Project")) ||
              (integration.integration === "bitbucket" && "Repository") ||
              (integration.integration === "octopus-deploy" && "Project") ||
              (integration.integration === "aws-secret-manager" && "Secret") ||
              (["aws-parameter-store", "rundeck"].includes(integration.integration) && "Path") ||
              (integration?.integration === "terraform-cloud" && "Project") ||
              (integration?.scope === "github-org" && "Organization") ||
              (["github-repo", "github-env"].includes(integration?.scope as string) &&
                "Repository") ||
              "App"
            }
          />
          <div className={FIELD_CLASSNAME}>{getIntegrationDestination(integration)}</div>
        </div>
      )}
      {(integration.integration === "vercel" ||
        integration.integration === "netlify" ||
        integration.integration === "railway" ||
        integration.integration === "gitlab" ||
        integration.integration === "teamcity" ||
        (integration.integration === "github" && integration.scope === "github-env")) && (
        <div>
          <FormLabel label="Target Environment" />
          <div className={FIELD_CLASSNAME}>
            {integration.targetEnvironment || integration.targetEnvironmentId}
          </div>
        </div>
      )}
      {integration.integration === "bitbucket" && (
        <>
          {integration.targetServiceId && (
            <div>
              <FormLabel label="Environment" />
              <div className={FIELD_CLASSNAME}>
                {integration.targetService || integration.targetServiceId}
              </div>
            </div>
          )}
          <div>
            <FormLabel label="Workspace" />
            <div className={FIELD_CLASSNAME}>
              {integration.targetEnvironment || integration.targetEnvironmentId}
            </div>
          </div>
        </>
      )}
      {integration.integration === "checkly" && integration.targetService && (
        <div>
          <FormLabel label="Group" />
          <div className={FIELD_CLASSNAME}>{integration.targetService}</div>
        </div>
      )}
      {integration.integration === "circleci" && integration.owner && (
        <div>
          <FormLabel label="Organization" />
          <div className={FIELD_CLASSNAME}>{integration.owner}</div>
        </div>
      )}
      {integration.integration === "terraform-cloud" && integration.targetService && (
        <div>
          <FormLabel label="Category" />
          <div className={FIELD_CLASSNAME}>{integration.targetService}</div>
        </div>
      )}
      {(integration.integration === "checkly" || integration.integration === "github") &&
        integration?.metadata?.secretSuffix && (
          <div>
            <FormLabel label="Secret Suffix" />
            <div className={FIELD_CLASSNAME}>{integration.metadata.secretSuffix}</div>
          </div>
        )}
      {integration.integration === "github" && integration.metadata?.githubVisibility ? (
        <div className="mt-2 text-xs text-mineshaft-200">
          {/* eslint-disable-next-line no-nested-ternary */}
          {integration.metadata?.githubVisibility === "selected"
            ? "* Syncing to selected repositories in the organization. "
            : integration.metadata?.githubVisibility === "private"
              ? "* Syncing to all private repositories in the organization"
              : "* Syncing to all public and private repositories in the organization"}
        </div>
      ) : undefined}
    </div>
  );
};
