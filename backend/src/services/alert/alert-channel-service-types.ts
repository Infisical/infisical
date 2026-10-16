import { AlertChannelType } from "./alert-channel-types";
import { AlertPrincipalType } from "./alert-types";

export type TChannelRecipientInput = {
  principalType: AlertPrincipalType;
  principalId: string;
};

export type TAlertChannelEmbedded = {
  id: string;
  name: string;
  channelType: string;
  enabled: boolean;
  config: Record<string, unknown>;
  recipients: { principalType: string; principalId: string }[];
  createdAt: Date;
  updatedAt: Date;
};

export type TAlertChannelInput = {
  id?: string;
  name: string;
  channelType: AlertChannelType;
  config?: Record<string, unknown>;
  enabled?: boolean;
  recipients?: TChannelRecipientInput[];
};

// A channel write that has passed every check and had its config encrypted. Applying it is plain inserts
// and updates, so it can join a caller's transaction without a KMS call or a validation read inside it.
export type TPreparedChannelCreate = {
  row: {
    name: string;
    channelType: string;
    encryptedConfig: Buffer;
    enabled: boolean;
    orgId: string;
    projectId: string | null;
    createdByActorId: string | null;
    createdByActorType: string;
  };
  recipients: TChannelRecipientInput[];
};

export type TPreparedChannelUpdate = {
  channelId: string;
  patch: { name?: string; enabled?: boolean; encryptedConfig?: Buffer };
  recipients?: TChannelRecipientInput[];
};
