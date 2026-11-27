import { CircleCiScope } from "@app/hooks/api/integrationAuth/types";
import {
  IntegrationMappingBehavior,
  type TCloudIntegration,
  type TIntegration
} from "@app/hooks/api/integrations/types";
import { integrationSlugNameMapping } from "@app/pages/secret-manager/IntegrationsDetailsByIDPage/IntegrationsDetailsByIDPage.utils";

import { orgHref } from "../../links";

export const NATIVE_INTEGRATIONS_TAB = "native-integrations";
export const SECRET_SYNCS_TAB = "secret-syncs";
export const MIGRATION_DOCS =
  "https://infisical.com/docs/integrations/secret-syncs/native-integrations-migration";

export const integrationsHref = (orgId: string, projectId: string, tab: string) =>
  orgHref(orgId, `/projects/secret-management/${projectId}/integrations?selectedTab=${tab}`);

export const integrationHref = (orgId: string, projectId: string, integrationId: string) =>
  orgHref(orgId, `/projects/secret-management/${projectId}/integrations/${integrationId}`);

export const integrationName = (slug: string, options?: readonly TCloudIntegration[]) =>
  options?.find((option) => option.slug === slug)?.name ?? integrationSlugNameMapping[slug] ?? slug;

export const destinationOf = (integration: TIntegration) =>
  (integration.integration === "hashicorp-vault" &&
    `${integration.app} - path: ${integration.path}`) ||
  (integration.scope === "github-org" && `${integration.owner}`) ||
  (["aws-parameter-store", "rundeck"].includes(integration.integration) && `${integration.path}`) ||
  (integration.scope?.startsWith("github-") && `${integration.owner}/${integration.app}`) ||
  integration.app ||
  "-";

const destinationLabel = (integration: TIntegration) => {
  switch (integration.integration) {
    case "qovery":
      return integration.scope ?? "App";
    case "circleci":
      return integration.scope === CircleCiScope.Context ? "Context" : "Project";
    case "terraform-cloud":
    case "octopus-deploy":
      return "Project";
    case "aws-secret-manager":
      return "Secret";
    case "aws-parameter-store":
    case "rundeck":
      return "Path";
    case "bitbucket":
      return "Repository";
    case "github":
      return integration.scope === "github-org" ? "Organization" : "Repository";
    default:
      return "App";
  }
};

const TARGET_ENVIRONMENT_APPS = ["vercel", "netlify", "railway", "gitlab", "teamcity"];

export type Fact = [string, string];

export const destinationFacts = (integration: TIntegration): Fact[] => {
  const facts: Fact[] = [];
  const add = (label: string, value?: string | null) => facts.push([label, value || "-"]);
  const slug = integration.integration;

  if (slug === "qovery") {
    add("Organization", integration.owner);
    add("Project", integration.targetService);
    add("Target environment", integration.targetEnvironment);
  }
  const isOneToOneSecret =
    slug === "aws-secret-manager" &&
    integration.metadata?.mappingBehavior === IntegrationMappingBehavior.ONE_TO_ONE;
  if (!isOneToOneSecret) add(destinationLabel(integration), destinationOf(integration));

  if (slug === "bitbucket")
    add("Workspace", integration.targetEnvironment || integration.targetEnvironmentId);
  else if (slug === "octopus-deploy") add("Space", integration.targetEnvironment);
  else if (
    TARGET_ENVIRONMENT_APPS.includes(slug) ||
    (slug === "github" && integration.scope === "github-env")
  )
    add("Target environment", integration.targetEnvironment || integration.targetEnvironmentId);

  if (slug === "checkly" && integration.targetService) add("Group", integration.targetService);
  else if (slug === "circleci" && integration.owner) add("Organization", integration.owner);
  else if (slug === "terraform-cloud" && integration.targetService)
    add("Category", integration.targetService);
  else if (slug === "checkly" || slug === "github")
    add("Secret suffix", integration.metadata?.secretSuffix);
  else if (slug === "bitbucket" && integration.targetServiceId)
    add("Deployment environment", integration.targetService);
  else if (slug === "windmill" && integration.url) add("Instance URL", integration.url);

  return facts;
};

export type SyncState = "pending" | "synced" | "failed";

export const syncStateOf = (integration: TIntegration): SyncState => {
  if (typeof integration.isSynced !== "boolean") return "pending";
  return integration.isSynced ? "synced" : "failed";
};

export const SYNC_STATE_LABEL: Record<SyncState, string> = {
  pending: "Pending sync",
  synced: "Synced",
  failed: "Not synced"
};

export const failureMessageOf = (integration: TIntegration) => {
  if (integration.isSynced !== false) return undefined;
  if (!integration.syncMessage) return "An unknown error occurred.";
  try {
    return JSON.stringify(JSON.parse(integration.syncMessage), null, 2);
  } catch {
    return integration.syncMessage;
  }
};

export const confirmKeyOf = (integration: TIntegration) =>
  (integration.integration === "azure-app-configuration" &&
    integration.app?.split("//")[1]?.split(".")[0]) ||
  integration.app ||
  integration.owner ||
  integration.path ||
  integration.integration;
