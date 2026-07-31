import { z } from "zod";

import { TCloudflareConnection } from "@app/services/app-connection/cloudflare/cloudflare-connection-types";

import {
  CloudflareR2AccessKeyRotationGeneratedCredentialsSchema,
  CloudflareR2AccessKeyRotationListItemSchema,
  CloudflareR2AccessKeyRotationSchema,
  CreateCloudflareR2AccessKeyRotationSchema
} from "./cloudflare-r2-access-key-rotation-schemas";

export type TCloudflareR2AccessKeyRotation = z.infer<typeof CloudflareR2AccessKeyRotationSchema>;

export type TCloudflareR2AccessKeyRotationInput = z.infer<typeof CreateCloudflareR2AccessKeyRotationSchema>;

export type TCloudflareR2AccessKeyRotationListItem = z.infer<typeof CloudflareR2AccessKeyRotationListItemSchema>;

export type TCloudflareR2AccessKeyRotationWithConnection = TCloudflareR2AccessKeyRotation & {
  connection: TCloudflareConnection;
};

export type TCloudflareR2AccessKeyRotationGeneratedCredentials = z.infer<
  typeof CloudflareR2AccessKeyRotationGeneratedCredentialsSchema
>;
