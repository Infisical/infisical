import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";

import {
  TDashboardHoneyTokenBase,
  THoneyTokenBase,
  THoneyTokenCredentialsResponseBase,
  THoneyTokenOptionBase
} from "./honey-token-base";

export type TAwsHoneyToken = THoneyTokenBase & {
  type: HoneyTokenType.AWS;
  secretsMapping: {
    accessKeyId: string;
    secretAccessKey: string;
  };
};

export type TAwsHoneyTokenCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
};

export type TAwsHoneyTokenCredentialsResponse = THoneyTokenCredentialsResponseBase<
  HoneyTokenType.AWS,
  TAwsHoneyTokenCredentials
>;

export type TAwsHoneyTokenOption = THoneyTokenOptionBase<HoneyTokenType.AWS, AppConnection.AWS>;

export type TDashboardAwsHoneyToken = TAwsHoneyToken &
  Omit<TDashboardHoneyTokenBase, keyof THoneyTokenBase>;
