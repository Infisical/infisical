import { z } from "zod";

import { TSalesforceConnection } from "@app/services/app-connection/salesforce";

import {
  CreateSalesforceOauthCredentialsRotationSchema,
  SalesforceOauthCredentialsRotationGeneratedCredentialsSchema,
  SalesforceOauthCredentialsRotationListItemSchema,
  SalesforceOauthCredentialsRotationSchema
} from "./salesforce-oauth-credentials-rotation-schemas";

export type TSalesforceOauthCredentialsRotation = z.infer<typeof SalesforceOauthCredentialsRotationSchema>;

export type TSalesforceOauthCredentialsRotationInput = z.infer<typeof CreateSalesforceOauthCredentialsRotationSchema>;

export type TSalesforceOauthCredentialsRotationListItem = z.infer<
  typeof SalesforceOauthCredentialsRotationListItemSchema
>;

export type TSalesforceOauthCredentialsRotationWithConnection = TSalesforceOauthCredentialsRotation & {
  connection: TSalesforceConnection;
};

export type TSalesforceOauthCredentialsRotationGeneratedCredentials = z.infer<
  typeof SalesforceOauthCredentialsRotationGeneratedCredentialsSchema
>;

type TSalesforceConsumer = {
  id: string;
  key: string;
  name: string;
  stagedCredentialsUrl: string;
  url: string;
};

export type TSalesforceConsumersResponse = {
  consumers: TSalesforceConsumer[];
  currentPageUrl: string;
  nextPageUrl?: string | null;
};

type TSalesforceStagedCredential = {
  id: string;
  key: string;
  secret: string;
  state: string;
  url: string;
};

export type TSalesforceStagedCredentialsResponse = {
  stagedCredentials: TSalesforceStagedCredential[];
  url: string;
};
