import { PushEvent } from "@octokit/webhooks-types";
import { z } from "zod";

import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TBitBucketConnection } from "@app/services/app-connection/bitbucket";

import {
  BitBucketDataSourceListItemSchema,
  BitBucketDataSourceSchema,
  BitBucketFindingSchema,
  CreateBitBucketDataSourceSchema
} from "./bitbucket-secret-scanning-schemas";

export type TBitBucketDataSource = z.infer<typeof BitBucketDataSourceSchema>;

export type TBitBucketDataSourceInput = z.infer<typeof CreateBitBucketDataSourceSchema>;

export type TBitBucketDataSourceListItem = z.infer<typeof BitBucketDataSourceListItemSchema>;

export type TBitBucketFinding = z.infer<typeof BitBucketFindingSchema>;

export type TBitBucketDataSourceWithConnection = TBitBucketDataSource & {
  connection: TBitBucketConnection;
};

export type TQueueBitBucketResourceDiffScan = {
  dataSourceType: SecretScanningDataSource.BitBucket;
  payload: PushEvent;
  dataSourceId: string;
  resourceId: string;
  scanId: string;
};
