import { z } from "zod";

import { SecretScanningDataSource } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { TBitbucketConnection } from "@app/services/app-connection/bitbucket";

import {
  BitbucketDataSourceCredentialsSchema,
  BitbucketDataSourceListItemSchema,
  BitbucketDataSourceSchema,
  BitbucketFindingSchema,
  CreateBitbucketDataSourceSchema
} from "./bitbucket-secret-scanning-schemas";

export type TBitbucketDataSource = z.infer<typeof BitbucketDataSourceSchema>;

export type TBitbucketDataSourceInput = z.infer<typeof CreateBitbucketDataSourceSchema>;

export type TBitbucketDataSourceListItem = z.infer<typeof BitbucketDataSourceListItemSchema>;

export type TBitbucketDataSourceCredentials = z.infer<typeof BitbucketDataSourceCredentialsSchema>;

export type TBitbucketFinding = z.infer<typeof BitbucketFindingSchema>;

export type TBitbucketDataSourceWithConnection = TBitbucketDataSource & {
  connection: TBitbucketConnection;
};

export type TBitbucketPushEventRepository = {
  full_name: string;
  name: string;
  workspace: {
    slug: string;
    uuid: string;
  };
  uuid: string;
};

export type TBitbucketPushEventCommit = {
  hash: string;
  message: string;
  author: {
    raw: string;
    user?: {
      display_name: string;
      uuid: string;
      nickname: string;
    };
  };
  date: string;
};

export type TBitbucketPushEventChange = {
  new?: {
    name: string;
    type: string;
  };
  old?: {
    name: string;
    type: string;
  };
  created: boolean;
  closed: boolean;
  forced: boolean;
  commits: TBitbucketPushEventCommit[];
};

export type TBitbucketPushEvent = {
  push: {
    changes: TBitbucketPushEventChange[];
  };
  repository: TBitbucketPushEventRepository;
  actor: {
    display_name: string;
    uuid: string;
    nickname: string;
  };
};

export type TQueueBitbucketResourceDiffScan = {
  dataSourceType: SecretScanningDataSource.Bitbucket;
  payload: TBitbucketPushEvent & { dataSourceId: string };
  dataSourceId: string;
  resourceId: string;
  scanId: string;
};
