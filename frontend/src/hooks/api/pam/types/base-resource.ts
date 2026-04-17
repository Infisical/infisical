export type TSessionSummaryConfig = {
  aiInsightsEnabled: boolean;
  connectionId: string;
  model: string;
} | null;

export interface TBasePamResource {
  id: string;
  projectId: string;
  name: string;
  gatewayId: string;
  domainId?: string | null;
  metadata?: { key: string; value: string }[];
  isFavorite?: boolean;
  sessionSummaryConfig?: TSessionSummaryConfig;
  createdAt: string;
  updatedAt: string;
}
