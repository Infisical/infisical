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
  directed: boolean;
  enabled: boolean;
  config: Record<string, unknown>;
  recipients: { principalType: string; principalId: string }[];
};

export type TAlertChannelInput = {
  id?: string;
  name: string;
  channelType: AlertChannelType;
  config?: Record<string, unknown>;
  enabled?: boolean;
  recipients?: TChannelRecipientInput[];
};
