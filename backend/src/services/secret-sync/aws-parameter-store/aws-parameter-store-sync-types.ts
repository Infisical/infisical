import { z } from "zod";

import { TAwsConnection } from "@app/services/app-connection/aws";

import {
  AwsParameterStoreSyncListItemSchema,
  AwsParameterStoreSyncSchema,
  CreateAwsParameterStoreSyncSchema
} from "./aws-parameter-store-sync-schemas";

export type TAwsParameterStoreSync = z.infer<typeof AwsParameterStoreSyncSchema>;

export type TAwsParameterStoreSyncInput = z.infer<typeof CreateAwsParameterStoreSyncSchema>;

export type TAwsParameterStoreSyncListItem = z.infer<typeof AwsParameterStoreSyncListItemSchema>;

export type TAwsParameterStoreSyncWithCredentials = TAwsParameterStoreSync & {
  connection: TAwsConnection;
};
