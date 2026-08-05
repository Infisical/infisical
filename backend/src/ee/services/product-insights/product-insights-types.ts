import { TOrgPermission } from "@app/lib/types";

export type TProductInsightsDTO = TOrgPermission;

export type TGetSecretsUsageInsightsDTO = TProductInsightsDTO;

export type TSecretsUsageInsights = {
  activeLeases: number;
  users: number;
  identities: number;
};
