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

/**
 * The storage jurisdiction of an R2 bucket. It is part of the bucket's identity — the same bucket name
 * can exist in more than one jurisdiction, and a token policy has to name both.
 */
export enum CloudflareR2Jurisdiction {
  Default = "default",
  Eu = "eu",
  FedRamp = "fedramp"
}

/** Name and jurisdiction together identify a bucket, and are all a token policy needs to grant it. */
export type TCloudflareR2Bucket = {
  name: string;
  jurisdiction: CloudflareR2Jurisdiction;
};
