import { Detail, DetailLabel } from "@app/components/v3";
import { CircleCiScope } from "@app/hooks/api/integrationAuth/types";
import { IntegrationMappingBehavior, TIntegration } from "@app/hooks/api/integrations/types";

type Props = {
  integration: TIntegration;
};

const FIELD_CLASSNAME =
  "truncate rounded-md border border-border-subtle bg-surface-base px-3 py-2 font-sans text-sm text-foreground-soft";

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
        <Detail>
          <DetailLabel>Space</DetailLabel>
          <div className={FIELD_CLASSNAME}>
            {integration.targetEnvironment || integration.targetEnvironmentId}
          </div>
        </Detail>
      )}
      {integration.integration === "qovery" && (
        <>
          <Detail>
            <DetailLabel>Org</DetailLabel>
            <div className={FIELD_CLASSNAME}>{integration?.owner || "-"}</div>
          </Detail>
          <Detail>
            <DetailLabel>Project</DetailLabel>
            <div className={FIELD_CLASSNAME}>{integration?.targetService || "-"}</div>
          </Detail>
          <Detail>
            <DetailLabel>Env</DetailLabel>
            <div className={FIELD_CLASSNAME}>{integration?.targetEnvironment || "-"}</div>
          </Detail>
        </>
      )}
      {!(
        integration.integration === "aws-secret-manager" &&
        integration.metadata?.mappingBehavior === IntegrationMappingBehavior.ONE_TO_ONE
      ) && (
        <Detail>
          <DetailLabel>
            {(integration.integration === "qovery" && integration?.scope) ||
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
              "App"}
          </DetailLabel>
          <div className={FIELD_CLASSNAME}>{getIntegrationDestination(integration)}</div>
        </Detail>
      )}
      {(integration.integration === "vercel" ||
        integration.integration === "netlify" ||
        integration.integration === "railway" ||
        integration.integration === "gitlab" ||
        integration.integration === "teamcity" ||
        (integration.integration === "github" && integration.scope === "github-env")) && (
        <Detail>
          <DetailLabel>Target Environment</DetailLabel>
          <div className={FIELD_CLASSNAME}>
            {integration.targetEnvironment || integration.targetEnvironmentId}
          </div>
        </Detail>
      )}
      {integration.integration === "bitbucket" && (
        <>
          {integration.targetServiceId && (
            <Detail>
              <DetailLabel>Environment</DetailLabel>
              <div className={FIELD_CLASSNAME}>
                {integration.targetService || integration.targetServiceId}
              </div>
            </Detail>
          )}
          <Detail>
            <DetailLabel>Workspace</DetailLabel>
            <div className={FIELD_CLASSNAME}>
              {integration.targetEnvironment || integration.targetEnvironmentId}
            </div>
          </Detail>
        </>
      )}
      {integration.integration === "checkly" && integration.targetService && (
        <Detail>
          <DetailLabel>Group</DetailLabel>
          <div className={FIELD_CLASSNAME}>{integration.targetService}</div>
        </Detail>
      )}
      {integration.integration === "circleci" && integration.owner && (
        <Detail>
          <DetailLabel>Organization</DetailLabel>
          <div className={FIELD_CLASSNAME}>{integration.owner}</div>
        </Detail>
      )}
      {integration.integration === "terraform-cloud" && integration.targetService && (
        <Detail>
          <DetailLabel>Category</DetailLabel>
          <div className={FIELD_CLASSNAME}>{integration.targetService}</div>
        </Detail>
      )}
      {(integration.integration === "checkly" || integration.integration === "github") &&
        integration?.metadata?.secretSuffix && (
          <Detail>
            <DetailLabel>Secret Suffix</DetailLabel>
            <div className={FIELD_CLASSNAME}>{integration.metadata.secretSuffix}</div>
          </Detail>
        )}
      {integration.integration === "github" && integration.metadata?.githubVisibility ? (
        <div className="mt-2 text-xs text-foreground-secondary">
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
