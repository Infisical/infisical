import { CronJob } from "cron";

export type TRateLimitUpdateDTO = {
  readRateLimit: number;
  writeRateLimit: number;
  secretsRateLimit: number;
  authRateLimit: number;
  inviteUserRateLimit: number;
  mfaRateLimit: number;
  publicEndpointLimit: number;
  identityCreationLimit: number;
  projectCreationLimit: number;
};

export type TRateLimit = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
} & TRateLimitUpdateDTO;

export type RateLimitConfiguration = {
  readLimit: number;
  publicEndpointLimit: number;
  writeLimit: number;
  secretsLimit: number;
  authRateLimit: number;
  inviteUserRateLimit: number;
  mfaRateLimit: number;
  identityCreationLimit: number;
  projectCreationLimit: number;
};

export type TRateLimitServiceFactory = {
  getRateLimits: () => Promise<TRateLimit | undefined>;
  updateRateLimit: (updates: TRateLimitUpdateDTO) => Promise<TRateLimit>;
  initializeBackgroundSync: () => Promise<CronJob<null, null> | undefined>;
  syncRateLimitConfiguration: () => Promise<void>;
};
