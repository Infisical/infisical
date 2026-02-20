import { z } from "zod";

import { TAlibabaCloudConnection } from "@app/services/app-connection/alibaba-cloud";

import {
  AlibabaCloudKMSSyncListItemSchema,
  AlibabaCloudKMSSyncSchema,
  CreateAlibabaCloudKMSSyncSchema
} from "./alibaba-cloud-kms-sync-schemas";

export type TAlibabaCloudKMSSync = z.infer<typeof AlibabaCloudKMSSyncSchema>;
export type TAlibabaCloudKMSSyncInput = z.infer<typeof CreateAlibabaCloudKMSSyncSchema>;
export type TAlibabaCloudKMSSyncListItem = z.infer<typeof AlibabaCloudKMSSyncListItemSchema>;

export type TAlibabaCloudKMSSyncWithCredentials = TAlibabaCloudKMSSync & {
  connection: TAlibabaCloudConnection;
};
