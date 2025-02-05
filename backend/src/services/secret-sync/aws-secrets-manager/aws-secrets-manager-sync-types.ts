import { z } from "zod";

import { TAwsConnection } from "@app/services/app-connection/aws";

import {
  AwsSecretsManagerSyncListItemSchema,
  AwsSecretsManagerSyncSchema,
  CreateAwsSecretsManagerSyncSchema
} from "./aws-secrets-manager-sync-schemas";

export type TAwsSecretsManagerSync = z.infer<typeof AwsSecretsManagerSyncSchema>;

export type TAwsSecretsManagerSyncInput = z.infer<typeof CreateAwsSecretsManagerSyncSchema>;

export type TAwsSecretsManagerSyncListItem = z.infer<typeof AwsSecretsManagerSyncListItemSchema>;

export type TAwsSecretsManagerSyncWithCredentials = TAwsSecretsManagerSync & {
  connection: TAwsConnection;
};
