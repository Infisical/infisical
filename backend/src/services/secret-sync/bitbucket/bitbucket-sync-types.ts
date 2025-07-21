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
  // Secure variables values are not returned by the API neither are they shown in Bitbucket UI
  secured: boolean;
  uuid: string;
  type: string;
};

export type TBitbucketListVariables = {
  workspaceSlug: string;
  repositorySlug: string;
  environmentId?: string;
  authHeader: string;
};

export type TPutBitbucketVariable = {
  authHeader: string;
  workspaceSlug: string;
  repositorySlug: string;
  environmentId?: string;
};

export type TDeleteBitbucketVariable = {
  authHeader: string;
  workspaceSlug: string;
  repositorySlug: string;
  environmentId?: string;
  keys: string[];
};

export type TBitbucketConnectionCredentials = {
  authHeader: string;
};
