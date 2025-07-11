import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
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

export type TCloudflareConnectionConfig = {
  apiToken: string;
};

export type TCloudflarePagesProject = {
  id: string;
  name: string;
};
