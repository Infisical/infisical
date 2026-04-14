export enum VercelSyncScope {
  Project = "project",
  Team = "team"
}

export const VercelEnvironmentType = {
  Development: "development",
  Preview: "preview",
  Production: "production"
} as const;

export type VercelEnvironment = (typeof VercelEnvironmentType)[keyof typeof VercelEnvironmentType];
