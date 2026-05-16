export type TGetPamInsightsParams = {
  projectId: string;
};

export type TPamFailedRotationAccount = {
  accountId: string;
  accountName: string;
  resourceId: string;
  resourceName: string;
  resourceType: string;
  lastRotatedAt: string | null;
};

export type TPamInsightsSummary = {
  totalResources: number;
  resourcesWithRotation: number;
  totalAccounts: number;
  failedRotations: number;
  failedRotationAccounts: TPamFailedRotationAccount[];
  activeSessions: number;
  resourceTypeCount: number;
};

export type TPamSessionActivityDay = {
  date: string;
  count: number;
};

export type TPamSessionActivityResponse = {
  days: TPamSessionActivityDay[];
  avgPerDay: number;
};

export type TPamTopActor = {
  actorName: string;
  actorEmail: string;
  sessionCount: number;
  isService: boolean;
};

export type TPamTopActorsResponse = {
  actors: TPamTopActor[];
};

export type TPamResourceBreakdownEntry = {
  resourceType: string;
  resourceCount: number;
};

export type TPamResourceBreakdownResponse = {
  breakdown: TPamResourceBreakdownEntry[];
};

export type TPamRotationCalendarEvent = {
  id: string;
  accountId: string;
  accountName: string;
  resourceId: string;
  resourceName: string;
  resourceType: string;
  intervalSeconds: number;
  nextRotationAt: string;
};

export type TPamRotationCalendarResponse = {
  rotations: TPamRotationCalendarEvent[];
};

export type TGetPamRotationCalendarParams = {
  projectId: string;
  month: number;
  year: number;
};
