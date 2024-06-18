export type TRateLimit = {
  readRateLimit: number;
  writeRateLimit: number;
  secretsRateLimit: number;
  authRateLimit: number;
  inviteUserRateLimit: number;
  mfaRateLimit: number;
  creationLimit: number;
  publicEndpointLimit: number;
};
