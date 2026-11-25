import { Knex } from "knex";

import { Plan, PlanLimit, TLicenseService } from "@app/domains/platform/license/ce/module";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";

export enum ResourceLimit {
  ProjectsPerOrg = "projectsPerOrg",
  TagsPerProject = "tagsPerProject",
  ImportsPerFolder = "importsPerFolder",
  SecretSyncsPerProject = "secretSyncsPerProject",
  SecretRotationsPerProject = "secretRotationsPerProject",
  WebhooksPerProject = "webhooksPerProject",
  ServiceTokensPerProject = "serviceTokensPerProject",
  IntegrationAuthsPerProject = "integrationAuthsPerProject",
  ApprovalPoliciesPerProject = "approvalPoliciesPerProject",
  ApprovalPoliciesPerEnvironment = "approvalPoliciesPerEnvironment",
  ProjectTemplatesPerOrg = "projectTemplatesPerOrg",
  SecretValidationRulesPerEnvironment = "secretValidationRulesPerEnvironment"
}

const PLAN_LIMITS: Record<ResourceLimit, PlanLimit> = {
  [ResourceLimit.ProjectsPerOrg]: PlanLimit.SmProjectsPerOrg,
  [ResourceLimit.TagsPerProject]: PlanLimit.SmTagsPerProject,
  [ResourceLimit.ImportsPerFolder]: PlanLimit.SmSecretImportsPerFolder,
  [ResourceLimit.SecretSyncsPerProject]: PlanLimit.SmSecretSyncsPerProject,
  [ResourceLimit.SecretRotationsPerProject]: PlanLimit.SmSecretRotationsPerProject,
  [ResourceLimit.WebhooksPerProject]: PlanLimit.SmWebhooksPerProject,
  [ResourceLimit.ServiceTokensPerProject]: PlanLimit.SmServiceTokensPerProject,
  [ResourceLimit.IntegrationAuthsPerProject]: PlanLimit.SmIntegrationAuthsPerProject,
  [ResourceLimit.ApprovalPoliciesPerProject]: PlanLimit.SmApprovalPoliciesPerProject,
  [ResourceLimit.ApprovalPoliciesPerEnvironment]: PlanLimit.SmApprovalPoliciesPerEnvironment,
  [ResourceLimit.ProjectTemplatesPerOrg]: PlanLimit.SmProjectTemplatesPerOrg,
  [ResourceLimit.SecretValidationRulesPerEnvironment]: PlanLimit.SmSecretValidationRulesPerEnvironment
};

export type TResourceLimits = {
  max: (limit: ResourceLimit) => number | null;
  // `describe` receives the cap and returns the whole message, so each call site can name the resource and the
  // way out in its own words.
  assertWithin: (args: { limit: ResourceLimit; used: number; adding?: number; describe: (max: number) => string }) => void;
};

const resourceLimitsFromPlan = (plan: Plan | null): TResourceLimits => {
  const max = (limit: ResourceLimit) => (plan ? plan.limit(PLAN_LIMITS[limit]) : null);
  return {
    max,
    assertWithin: ({ limit, used, adding = 1, describe }) => {
      const cap = max(limit);
      if (cap !== null && used + adding > cap) {
        throw new BadRequestError({ name: "ResourceLimitExceeded", message: describe(cap) });
      }
    }
  };
};

export const NO_RESOURCE_LIMITS = resourceLimitsFromPlan(null);

export const getResourceLimits = async (
  licenseService: Pick<TLicenseService, "getPlan" | "getLastKnownPlan">,
  orgId: string
): Promise<TResourceLimits> => {
  if (!getConfig().INFISICAL_CLOUD) return NO_RESOURCE_LIMITS;

  let plan = await licenseService.getPlan(orgId);
  if (plan.isFallback) {
    plan = (await licenseService.getLastKnownPlan(orgId))?.plan ?? plan;
  }
  return resourceLimitsFromPlan(plan);
};

export const countOnPrimary = (
  dal: { transaction: <T>(cb: (tx: Knex) => Promise<T>) => Promise<T> },
  count: (tx: Knex) => Promise<number>
) => dal.transaction(count);
