import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";

import {
  TAwsHoneyToken,
  TAwsHoneyTokenCredentialsResponse,
  TAwsHoneyTokenOption,
  TDashboardAwsHoneyToken
} from "./aws-honey-token";

export type THoneyToken = TAwsHoneyToken;

export type TDashboardHoneyToken = TDashboardAwsHoneyToken;

export type THoneyTokenOption = TAwsHoneyTokenOption;

export type THoneyTokenCredentialsResponse = TAwsHoneyTokenCredentialsResponse;

export type THoneyTokenOptionMap = {
  [HoneyTokenType.AWS]: TAwsHoneyTokenOption;
};

export type THoneyTokenCredentialsResponseMap = {
  [HoneyTokenType.AWS]: TAwsHoneyTokenCredentialsResponse;
};

export type TCreateHoneyTokenDTO = {
  projectId: string;
  type: HoneyTokenType;
  name: string;
  description?: string | null;
  secretsMapping: Record<string, string>;
  environment: string;
  secretPath: string;
};

export type TCreateHoneyTokenResponse = {
  honeyToken: THoneyToken;
  stackDeployment?: {
    deployed: boolean;
    status: string | null;
  };
};

export type TUpdateHoneyTokenDTO = {
  honeyTokenId: string;
  projectId: string;
  name?: string;
  description?: string | null;
  secretsMapping?: Record<string, string>;
};

export type TDeleteHoneyTokenDTO = {
  honeyTokenId: string;
  projectId: string;
};

export type TRevokeHoneyTokenDTO = {
  honeyTokenId: string;
  projectId: string;
};

export {
  type TAwsHoneyToken,
  type TAwsHoneyTokenCredentialsResponse,
  type TAwsHoneyTokenOption,
  type TDashboardAwsHoneyToken
} from "./aws-honey-token";
export {
  type TDashboardHoneyTokenBase,
  type THoneyTokenBase,
  type THoneyTokenCredentialsResponseBase,
  type THoneyTokenDetails,
  type THoneyTokenEvent,
  type THoneyTokenOptionBase
} from "./honey-token-base";
