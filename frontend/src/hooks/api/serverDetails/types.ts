export type ServerStatus = {
  date: string;
  message: string;
  emailConfigured: boolean;
  secretScanningConfigured: boolean;
  redisConfigured: boolean;
  samlDefaultOrgSlug: string;
};
