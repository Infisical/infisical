import z from "zod";

import { DiscriminativePick } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  AzureDnsConnectionSchema,
  CreateAzureDnsConnectionSchema,
  ValidateAzureDnsConnectionCredentialsSchema
} from "./azure-dns-connection-schema";

export type TAzureDnsConnection = z.infer<typeof AzureDnsConnectionSchema>;

export type TAzureDnsConnectionInput = z.infer<typeof CreateAzureDnsConnectionSchema> & {
  app: AppConnection.AzureDNS;
};

export type TValidateAzureDnsConnectionCredentialsSchema = typeof ValidateAzureDnsConnectionCredentialsSchema;

export type TAzureDnsConnectionConfig = DiscriminativePick<
  TAzureDnsConnectionInput,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TAzureDnsZone = {
  id: string;
  name: string;
};
