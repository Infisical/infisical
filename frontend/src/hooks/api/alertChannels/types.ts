import { AlertChannelType, AlertPrincipalType } from "../alerts/types";

export type TAlertChannelRecipient = {
  principalType: AlertPrincipalType;
  principalId: string;
};

export type TAlertChannel = {
  id: string;
  name: string;
  channelType: AlertChannelType;
  directed: boolean;
  config: Record<string, unknown>;
  enabled: boolean;
  recipients: TAlertChannelRecipient[];
  usageCount: number;
  orgId: string;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TListAlertChannelsDTO = {
  projectId?: string;
};
