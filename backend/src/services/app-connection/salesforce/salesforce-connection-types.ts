import { z } from "zod";

import { DiscriminativePick } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import {
  CreateSalesforceConnectionSchema,
  SalesforceConnectionSchema,
  ValidateSalesforceConnectionCredentialsSchema
} from "./salesforce-connection-schemas";

export type TSalesforceConnection = z.infer<typeof SalesforceConnectionSchema>;

export type TSalesforceConnectionInput = z.infer<typeof CreateSalesforceConnectionSchema> & {
  app: AppConnection.Salesforce;
};

export type TValidateSalesforceConnectionCredentialsSchema = typeof ValidateSalesforceConnectionCredentialsSchema;

export type TSalesforceConnectionConfig = DiscriminativePick<
  TSalesforceConnection,
  "method" | "app" | "credentials"
> & {
  orgId: string;
};

export type TSalesforceTokenResponse = {
  access_token: string;
  instance_url: string;
  token_type: string;
  issued_at: string;
  signature?: string;
  scope?: string;
};
