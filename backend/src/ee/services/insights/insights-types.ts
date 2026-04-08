export type TGetInsightsCalendarDTO = {
  projectId: string;
  month: number;
  year: number;
};

export type TGetAccessVolumeDTO = {
  projectId: string;
};

export type TGetAccessLocationsDTO = {
  projectId: string;
  days: number;
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
