export type TRateLimitUpdateDTO = {
  readRateLimit: number;
  writeRateLimit: number;
  secretsRateLimit: number;
  authRateLimit: number;
  inviteUserRateLimit: number;
  mfaRateLimit: number;
  publicEndpointLimit: number;
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
};
