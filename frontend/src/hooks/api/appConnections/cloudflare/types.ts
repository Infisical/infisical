export type TCloudflarePagesProject = {
  id: string;
  name: string;
};

export type TCloudflareWorkersScript = {
  id: string;
};

export type TCloudflareZone = {
  id: string;
  name: string;
};

export type TCloudflarePermissionGroup = {
  id: string;
  name: string;
  // the resource types this permission group can be attached to, e.g. "com.cloudflare.api.account.zone"
  scopes: string[];
};
