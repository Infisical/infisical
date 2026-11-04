import {
  AwsHoneyTokenDeploymentUnavailableReason,
  HoneyTokenConfigStatus,
  HoneyTokenManagedBy,
  HoneyTokenType
} from "@app/hooks/api/honeyTokens/enums";

export { HoneyTokenConfigStatus, HoneyTokenType };

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

export type TAwsHoneyTokenDeploymentOption = {
  managedBy: HoneyTokenManagedBy;
  unavailableReason: AwsHoneyTokenDeploymentUnavailableReason | null;
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
