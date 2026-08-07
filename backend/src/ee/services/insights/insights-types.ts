import { z } from "zod";

import { TOrgPermission } from "@app/lib/types";

import {
  OrgAuthMethodDistributionSchema,
  OrgSecretsAccessVolumeSchema,
  OrgSecretsCountsSchema,
  SecretsProjectsSchema,
  SecretsProjectWarningSchema,
  SecretsSummarySchema,
  StaticSecretsUsageSchema
} from "./insights-schemas";

// Project-scoped insights: the dashboard for a single secret management project.

export type TGetInsightsCalendarDTO = {
  projectId: string;
  month: number;
  year: number;
};

export type TGetAccessVolumeDTO = {
  projectId: string;
};

export type TGetAuthMethodDistributionDTO = {
  projectId: string;
  days: number;
};

export type TGetInsightsSummaryDTO = {
  projectId: string;
  staleSecretsOffset?: number;
  staleSecretsLimit?: number;
};

export type TGetSecretsDuplicationDTO = {
  projectId: string;
};

export type TGetInsightsCountsDTO = {
  projectId: string;
};

// Org-scoped insights: aggregates spanning every secret management project in the organization.

export type TOrgInsightsDTO = TOrgPermission;

export type TGetSecretsProjectWarningsDTO = TOrgInsightsDTO & {
  offset: number;
  limit: number;
};

// The org-wide responses are derived from the route schemas rather than restated, so the shape and its
// field documentation live in one place. Every field is documented there via .describe().
export type TSecretsUsageInsights = z.infer<typeof SecretsSummarySchema>;
export type TSecretsProjectWarning = z.infer<typeof SecretsProjectWarningSchema>;
export type TSecretsProjectWarnings = z.infer<typeof SecretsProjectsSchema>;
export type TOrgAccessVolume = z.infer<typeof OrgSecretsAccessVolumeSchema>;
export type TOrgAuthMethodDistribution = z.infer<typeof OrgAuthMethodDistributionSchema>;
export type TStaticSecretsUsage = z.infer<typeof StaticSecretsUsageSchema>;
export type TOrgSecretsCounts = z.infer<typeof OrgSecretsCountsSchema>;

export type TAccessVolumeActor = {
  name: string;
  type: string;
  count: number;
};

export type TAccessVolumeDay = {
  date: string;
  total: number;
  actors: TAccessVolumeActor[];
};
