export type TRateLimitUpdateDTO = {
  readRateLimit: number;
  writeRateLimit: number;
  secretsRateLimit: number;
  authRateLimit: number;
  inviteUserRateLimit: number;
  mfaRateLimit: number;
  creationLimit: number;
  publicEndpointLimit: number;
};

export type TRateLimit = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
} & TRateLimitUpdateDTO;
