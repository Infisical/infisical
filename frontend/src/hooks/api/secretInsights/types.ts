import { SecretFolderRole } from "../folderAccess/types";
import { IdentityAuthMethod } from "../identities/enums";

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

export enum UnusedAccessActorType {
  User = "user",
  Identity = "identity"
}

// A built-in role has no id; a custom role has the slug "custom" and its own id.
export type TUnusedAccessRole = {
  id: string | null;
  slug: string;
  name: string;
};

export type TUnusedAccessPaths = {
  roles: TUnusedAccessRole[];
  groups: { id: string; name: string; roles: TUnusedAccessRole[] }[];
  additionalPrivileges: { id: string; name: string }[];
  folderAccess: {
    id: string;
    folderId: string;
    environment: string;
    secretPath: string;
    role: SecretFolderRole;
  }[];
};

// A user or machine identity that can read secrets it has not read in the tracked period.
export type TUnusedAccessActor = {
  actorType: UnusedAccessActorType;
  actorId: string;
  name: string;
  accessibleSecretCount: number;
  unusedSecretCount: number;
  environments: string[];
  accessPaths: TUnusedAccessPaths;
};

export type TGetUnusedAccessDTO = {
  projectId: string;
  offset: number;
  limit: number;
  search?: string;
};

export type TGetUnusedAccessResponse = {
  actors: TUnusedAccessActor[];
  totalCount: number;
  // Nothing is judged before this date: 30 days after tracking began.
  unusedAccessFrom: string;
  remainingTtl: number;
};

export type TGetUnusedAccessActorDTO = {
  projectId: string;
  actorType: UnusedAccessActorType;
  actorId: string;
};

export type TUnusedSecret = {
  secretKey: string;
  environment: string;
  secretPath: string;
};

export type TGetUnusedAccessActorResponse = {
  actor: TUnusedAccessActor;
  secrets: TUnusedSecret[];
  unusedAccessFrom: string;
  remainingTtl: number;
};

export enum SecretReadStatus {
  Read = "read",
  Unused = "unused",
  NotJudged = "not-judged"
}

export enum SecretReadNotJudgedReason {
  ProjectAdmin = "project-admin",
  TrackingTooNew = "tracking-too-new",
  AccessTooNew = "access-too-new",
  SecretTooNew = "secret-too-new"
}

export type TGetSecretReadActivityDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
  secretKey: string;
};

export type TSecretReadActivityActor = {
  actorType: UnusedAccessActorType;
  actorId: string;
  name: string;
  isProjectAdmin: boolean;
  lastReadAt: string | null;
  // When they got access to this secret.
  accessSince: string;
  readStatus: SecretReadStatus;
  notJudgedReason: SecretReadNotJudgedReason | null;
};

export type TSecretReadActivity = {
  readsTrackedSince: string;
  unusedAccessFrom: string;
  actors: TSecretReadActivityActor[];
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

// Org-scoped insights (endpoints without :projectId — the org comes from the auth token).
// Shapes mirror backend/src/ee/services/insights/insights-schemas.ts.

export type TOrgSecretsSummary = {
  activeLeases: number;
  users: number;
  identities: number;
};

export type TOrgProjectInsightWarnings = {
  // null means unknown (e.g. secret blind index disabled), which is different from zero
  duplicatedSecrets: number | null;
  staleSecrets: number;
  failedRotations: number;
  failedSyncs: number;
  orphanedLeases: number;
};

export type TOrgProjectInsight = {
  projectId: string;
  projectName: string;
  projectSlug: string;
  totalSecrets: number;
  severityScore: number;
  warnings: TOrgProjectInsightWarnings;
};

export type TOrgProjectsInsights = {
  projects: TOrgProjectInsight[];
  totalProjects: number;
  projectsWithIssues: number;
  offset: number;
  limit: number;
};

export type TGetOrgSecretsProjectsDTO = {
  limit?: number;
};

export type TOrgAuthMethodUsage = {
  totalFetches: number;
  methods: { authMethod: IdentityAuthMethod; count: number }[];
};

export type TOrgStaticSecretUsage = {
  // Secrets created during each of the last twelve UTC calendar weeks, oldest first.
  // totalSecrets is a per-week count, not a running total.
  weeks: { weekStart: string; totalSecrets: number; isPartial: boolean }[];
};

export type TOrgDuplicatedSecretEntry = TDuplicatedSecretEntry & {
  projectId: string;
  projectName: string;
};

export type TOrgDuplicatedSecretGroup = {
  projectCount: number;
  locationCount: number;
  secrets: TOrgDuplicatedSecretEntry[];
};

export type TGetOrgSecretsDuplicationResponse = {
  orgWideSecretValueTrackingEnabled: boolean;
  groups: TOrgDuplicatedSecretGroup[];
  remainingTtl: number;
};

export type TGetOrgSecretValueTrackingStatusResponse = {
  status: "not-found" | "pending" | "completed" | "failed";
  message?: string;
  projectsTotal: number;
  projectsDone: number;
  secretsProcessed: number;
};

export type TSecretValueMatch = TOrgDuplicatedSecretEntry;

export type TSearchSecretsByValueResponse = {
  secrets: TSecretValueMatch[];
};

export type TOrgSecretAccessVolume = {
  days: { date: string; total: number }[];
};
