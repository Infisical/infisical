import { CloudflareTokenPolicyEffect } from "./cloudflare-token-rotation-schemas";

/**
 * The `resources` map of a token policy. Most scopes map a resource id to the "*" string, but
 * all-zones is expressed as a nested object instead.
 * https://developers.cloudflare.com/fundamentals/api/how-to/create-via-api/
 */
export type TCloudflareTokenResources = Record<string, string | Record<string, string>>;

export type TCloudflareTokenPolicyInput = {
  effect: CloudflareTokenPolicyEffect;
  resources: TCloudflareTokenResources;
  permissionGroupIds: string[];
};

/**
 * What Cloudflare hands back when a token is created. `tokenValue` is deliberately not named
 * `apiToken`: each rotation decides what to call it once persisted.
 */
export type TCloudflareTokenCredentials = {
  tokenId: string;
  tokenValue: string;
};

export type TCloudflareTokenRestrictions = {
  allowedIps?: string[];
  disallowedIps?: string[];
};

export type TCloudflareTokenCondition = {
  "request.ip": {
    in?: string[];
    not_in?: string[];
  };
};

export type TCloudflareCreateTokenResponse = {
  result: {
    id: string;
    name: string;
    value: string;
    status: string;
  } | null;
};

export type TCloudflareVerifyTokenResponse = {
  success: boolean;
  result: {
    id: string;
    status: string;
  } | null;
};
