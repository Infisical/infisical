import { z } from "zod";

import { TBitbucketConnection } from "@app/services/app-connection/bitbucket";

import { BitbucketSyncListItemSchema, BitbucketSyncSchema, CreateBitbucketSyncSchema } from "./bitbucket-sync-schemas";

export type TBitbucketSync = z.infer<typeof BitbucketSyncSchema>;

export type TBitbucketSyncInput = z.infer<typeof CreateBitbucketSyncSchema>;

export type TBitbucketSyncListItem = z.infer<typeof BitbucketSyncListItemSchema>;

export type TBitbucketSyncWithCredentials = TBitbucketSync & {
  connection: TBitbucketConnection;
};

export type TBitbucketVariable = {
  key: string;
  value?: string;
  secured: boolean;
  uuid: string;
  type: string;
};

export type TBitbucketListVariables = {
  apiToken: string;
  email: string;
  workspace: string;
  repository: string;
};

export type TPutBitbucketVariable = {
  email: string;
  apiToken: string;
  workspace: string;
  repository: string;
};

export type TDeleteBitbucketVariable = {
  email: string;
  apiToken: string;
  workspace: string;
  repository: string;
  keys: string[];
};

export type TBitbucketConnectionCredentials = {
  email: string;
  apiToken: string;
};
