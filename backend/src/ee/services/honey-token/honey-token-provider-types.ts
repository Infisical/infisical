import { OrderByDirection } from "@app/lib/types";

import { TAwsHoneyTokenCredentials } from "./aws/honey-token-aws-types";
import { HoneyTokenType } from "./honey-token-enums";
import { TAwsHoneyTokenConfig } from "./honey-token-types";

export type THoneyTokenCreateInput = {
  projectId: string;
  type: HoneyTokenType;
  name: string;
  description?: string | null;
  secretsMapping: Record<string, string>;
  environment: string;
  secretPath: string;
};

export type THoneyTokenUpdateInput = {
  honeyTokenId: string;
  name?: string;
  description?: string | null;
  secretsMapping?: Record<string, string>;
};

export type THoneyTokenByIdInput = { honeyTokenId: string };

export type THoneyTokenListInput = {
  projectId: string;
  environments: string[];
  secretPath: string;
  search?: string;
  orderBy?: string;
  orderDirection?: OrderByDirection;
  limit?: number;
  offset?: number;
};

export type THoneyTokenConfigByType = {
  [HoneyTokenType.AWS]: TAwsHoneyTokenConfig;
};

export type THoneyTokenDisplayCredentialsByType = {
  [HoneyTokenType.AWS]: TAwsHoneyTokenCredentials;
};

export type THoneyTokenTestConnectionResponseByType = {
  [HoneyTokenType.AWS]: {
    isConnected: boolean;
    status: string | null;
    stackName: string;
  };
};
