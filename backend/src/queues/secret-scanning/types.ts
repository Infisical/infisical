import { Commit } from "@octokit/webhooks-types";

type TScanQueueDetailsBase = {
  organizationId: string,
  repository:   {
    id: number,
    fullName: string
  },
  installationId: string,
};

export type TScanFullRepoQueueDetails = TScanQueueDetailsBase;

export type TScanPushEventQueueDetails = TScanQueueDetailsBase & {
  commits: Commit[],
  pusher: {
    name: string,
    email: string | null
  },
};