export enum VercelSyncScope {
  Application = "application",
  Environment = "environment"
}

export const VercelEnvironmentType = {
  Development: "development",
  Preview: "preview",
  Production: "production"
} as const;

export type VercelEnvironment = (typeof VercelEnvironmentType)[keyof typeof VercelEnvironmentType];
