import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";

export enum ResourceLimit {
  ProjectsPerOrg = "projectsPerOrg",
  EnvironmentsPerProject = "environmentsPerProject",
  TagsPerProject = "tagsPerProject",
  ImportsPerFolder = "importsPerFolder",
  SecretSyncsPerProject = "secretSyncsPerProject",
  SecretRotationsPerProject = "secretRotationsPerProject",
  WebhooksPerProject = "webhooksPerProject",
  ServiceTokensPerProject = "serviceTokensPerProject",
  IntegrationAuthsPerProject = "integrationAuthsPerProject",
  ApprovalPoliciesPerProject = "approvalPoliciesPerProject",
  ProjectTemplatesPerOrg = "projectTemplatesPerOrg",
  SecretValidationRulesPerProject = "secretValidationRulesPerProject"
}

const CLOUD_RESOURCE_LIMITS: Record<ResourceLimit, number> = {
  [ResourceLimit.ProjectsPerOrg]: 1000,
  [ResourceLimit.EnvironmentsPerProject]: 50,
  [ResourceLimit.TagsPerProject]: 1000,
  [ResourceLimit.ImportsPerFolder]: 100,
  [ResourceLimit.SecretSyncsPerProject]: 500,
  [ResourceLimit.SecretRotationsPerProject]: 500,
  [ResourceLimit.WebhooksPerProject]: 100,
  [ResourceLimit.ServiceTokensPerProject]: 1000,
  [ResourceLimit.IntegrationAuthsPerProject]: 100,
  [ResourceLimit.ApprovalPoliciesPerProject]: 100,
  [ResourceLimit.ProjectTemplatesPerOrg]: 100,
  [ResourceLimit.SecretValidationRulesPerProject]: 100
};

export const getResourceLimit = (limit: ResourceLimit): number | null =>
  getConfig().INFISICAL_CLOUD ? CLOUD_RESOURCE_LIMITS[limit] : null;

// `describe` receives the cap and returns the whole message, so each call site can name the resource and the
// way out in its own words.
export const assertWithinResourceLimit = ({
  limit,
  used,
  adding = 1,
  describe
}: {
  limit: ResourceLimit;
  used: number;
  adding?: number;
  describe: (max: number) => string;
}) => {
  const max = getResourceLimit(limit);
  if (max !== null && used + adding > max) {
    throw new BadRequestError({ name: "ResourceLimitExceeded", message: describe(max) });
  }
};
