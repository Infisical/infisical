import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { CloudflareR2Jurisdiction } from "./cloudflare-connection-enum";
import {
  CloudflareConnectionSchema,
  CreateCloudflareConnectionSchema,
  ValidateCloudflareConnectionCredentialsSchema
} from "./cloudflare-connection-schema";

export type TCloudflareConnection = z.infer<typeof CloudflareConnectionSchema>;

export type TCloudflareConnectionInput = z.infer<typeof CreateCloudflareConnectionSchema> & {
  app: AppConnection.Cloudflare;
};

export type TValidateCloudflareConnectionCredentialsSchema = typeof ValidateCloudflareConnectionCredentialsSchema;

export type TCloudflareConnectionConfig = DiscriminativePick<
  TCloudflareConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

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

/** Name and jurisdiction together identify a bucket, and are all a token policy needs to grant it. */
export type TCloudflareR2Bucket = {
  name: string;
  jurisdiction: CloudflareR2Jurisdiction;
};

/** Raw shape returned by Cloudflare's `GET /accounts/:id/r2/buckets` list endpoint. */
export type TCloudflareR2BucketsApiResponse = {
  result: {
    buckets?: {
      name: string;
      jurisdiction?: string;
    }[];
  } | null;
  result_info?: { cursor?: string };
};
