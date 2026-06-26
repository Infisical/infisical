export type TCalendarRotation = {
  id: string;
  name: string;
  type: string;
  nextRotationAt: string | null;
  environment: string;
  secretPath: string;
  secretKeys: string[];
  rotationInterval: number;
  rotationStatus: string | null;
  isAutoRotationEnabled: boolean;
};

export type TCalendarReminder = {
  id: string;
  secretId: string | null;
  secretKey: string;
  nextReminderDate: string;
  message?: string | null;
  environment: string;
  secretPath: string;
  repeatDays?: number | null;
};

export type TGetCalendarInsightsDTO = {
  projectId: string;
  month: number;
  year: number;
};

export type TGetCalendarInsightsResponse = {
  rotations: TCalendarRotation[];
  reminders: TCalendarReminder[];
};

export type TSecretAccessVolumeActor = {
  name: string;
  type: string;
  count: number;
};

export type TSecretAccessVolumeDay = {
  date: string;
  total: number;
  actors: TSecretAccessVolumeActor[];
};

export type TGetSecretAccessVolumeDTO = {
  projectId: string;
};

export type TGetInsightsSummaryDTO = {
  projectId: string;
  staleSecretsOffset?: number;
  staleSecretsLimit?: number;
};

export type TInsightRotationItem = {
  name: string;
  environment: string;
  secretPath: string;
  nextRotationAt: string | null;
  rotationStatus: string | null;
};

export type TInsightReminderItem = {
  secretKey: string;
  environment: string;
  secretPath: string;
  nextReminderDate: string;
};

export type TInsightStaleSecretItem = {
  key: string;
  environment: string;
  secretPath: string;
  updatedAt: string;
};

export type TGetInsightsSummaryResponse = {
  upcomingRotations: TInsightRotationItem[];
  failedRotations: TInsightRotationItem[];
  upcomingReminders: TInsightReminderItem[];
  overdueReminders: TInsightReminderItem[];
  staleSecrets: TInsightStaleSecretItem[];
  totalStaleCount: number;
};

export type TGetSecretAccessVolumeResponse = {
  days: TSecretAccessVolumeDay[];
};

export type TAccessLocation = {
  lat: number;
  lng: number;
  city: string;
  country: string;
  count: number;
};

export type TGetSecretAccessLocationsDTO = {
  projectId: string;
  days?: number;
};

export type TGetSecretAccessLocationsResponse = {
  locations: TAccessLocation[];
};

export type TAuthMethodCount = {
  method: string;
  count: number;
};

export type TGetAuthMethodDistributionDTO = {
  projectId: string;
  days?: number;
};

export type TGetAuthMethodDistributionResponse = {
  methods: TAuthMethodCount[];
};

export type TGetSecretsDuplicationDTO = {
  projectId: string;
};

export type TDuplicatedSecretEntry = {
  key: string;
  environment: {
    name: string;
    slug: string;
  };
  secretPath: string;
};

export type TDuplicatedSecretGroup = {
  secrets: TDuplicatedSecretEntry[];
};

export type TGetSecretsDuplicationResponse = {
  secretBlindIndexEnabled: boolean;
  groups: TDuplicatedSecretGroup[];
  remainingTtl: number;
};

export type TGetSecretBlindIndexStatusDTO = {
  projectId: string;
};

export type TGetSecretBlindIndexStatusResponse = {
  status: "not-found" | "pending" | "completed" | "failed";
  message?: string;
};

export type TGetInsightsCountsDTO = {
  projectId: string;
};

export type TGetInsightsCountsResponse = {
  secretCount: number;
  folderCount: number;
  dynamicSecretCount: number;
  secretRotationCount: number;
  honeyTokenCount: number | null;
};
