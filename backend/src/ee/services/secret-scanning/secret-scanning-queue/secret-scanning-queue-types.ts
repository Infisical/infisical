import { Commit } from "@octokit/webhooks-types";

export type SecretMatch = {
  Description: string;
  StartLine: number;
  EndLine: number;
  StartColumn: number;
  EndColumn: number;
  Match: string;
  Secret: string;
  File: string;
  Link: string;
  SymlinkFile: string;
  Commit: string;
  Entropy: number;
  Author: string;
  Email: string;
  Date: string;
  Message: string;
  Tags: string[];
  RuleID: string;
  Fingerprint: string;
  FingerPrintWithoutCommitId: string;
};

export type TScanPushEventPayload = {
  organizationId: string;
  commits: Commit[];
  pusher: {
    name: string;
    email: string | null;
  };
  repository: {
    id: number;
    fullName: string;
  };
  installationId: string;
};

export type TScanFullRepoEventPayload = {
  organizationId: string;
  installationId: string;
  repository: {
    id: number;
    fullName: string;
  };
};
