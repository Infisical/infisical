export type ServerStatus = {
  date: string;
  message: string;
  emailConfigured: boolean;
  inviteOnlySignup: boolean;
  secretScanningConfigured: boolean
  redisConfigured: boolean
};