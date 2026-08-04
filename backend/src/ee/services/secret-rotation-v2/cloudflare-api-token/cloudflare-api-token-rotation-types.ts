import { z } from "zod";

import { TCloudflareConnection } from "@app/services/app-connection/cloudflare/cloudflare-connection-types";

import {
  CloudflareApiTokenPolicySchema,
  CloudflareApiTokenRotationGeneratedCredentialsSchema,
  CloudflareApiTokenRotationListItemSchema,
  CloudflareApiTokenRotationSchema,
  CreateCloudflareApiTokenRotationSchema
} from "./cloudflare-api-token-rotation-schemas";

export type TCloudflareApiTokenRotation = z.infer<typeof CloudflareApiTokenRotationSchema>;

export type TCloudflareApiTokenRotationInput = z.infer<typeof CreateCloudflareApiTokenRotationSchema>;

export type TCloudflareApiTokenRotationListItem = z.infer<typeof CloudflareApiTokenRotationListItemSchema>;

export type TCloudflareApiTokenRotationWithConnection = TCloudflareApiTokenRotation & {
  connection: TCloudflareConnection;
};

export type TCloudflareApiTokenRotationGeneratedCredentials = z.infer<
  typeof CloudflareApiTokenRotationGeneratedCredentialsSchema
>;

export type TCloudflareApiTokenPolicy = z.infer<typeof CloudflareApiTokenPolicySchema>;
