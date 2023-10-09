import { Commit } from "@octokit/webhooks-types";
import { RiskStatus } from "../../ee/models";
import { Schema } from "mongoose";

export type TScanQueueDetailsBase = {
  organizationId: string,
  repository:   {
    id: number,
    fullName: string
  },
  installationId: string,
  salt: string
};

export type TScanPushEventQueueDetails = TScanQueueDetailsBase & {
  commits: Commit[],
  pusher: {
    name: string,
    email: string | null
  },
};

export interface GitHubRepoFileContent {
  content: string | null;
  errorMessage?: string;
}

export interface BatchRiskUpdateItem {
  fingerprint: string;
  data: {
    installationId: string;
    organization: Schema.Types.ObjectId;
    repositoryFullName: string;
    repositoryId: string;
    status: RiskStatus;
    gitSecretBlindIndex: string;
  };
}

export interface BulkOperationItem {
  updateOne: {
    filter: { fingerprint: string };
    update: { $set: BatchRiskUpdateItem["data"] };
    upsert: true;
  };
}