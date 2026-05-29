import { HoneyTokenType } from "@app/hooks/api/honeyTokens/enums";

export { HoneyTokenType };

export enum HoneyTokenConfigStatus {
  VerificationPending = "VERIFICATION_PENDING",
  Complete = "COMPLETE"
}

export type THoneyTokenConfig = {
  id: string;
  orgId: string;
  type: HoneyTokenType;
  connectionId: string;
  status: HoneyTokenConfigStatus;
  createdAt: string;
  updatedAt: string;
  decryptedConfig: {
    webhookSigningKey: string;
    stackName: string;
    awsRegion: string;
  } | null;
};

export type TUpsertHoneyTokenConfigDTO = {
  type: HoneyTokenType;
  connectionId: string;
  config: {
    webhookSigningKey: string;
    stackName?: string;
    awsRegion?: string;
  };
};
