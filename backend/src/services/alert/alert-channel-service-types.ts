import { TGenericPermission } from "@app/lib/types";

import { AlertChannelType } from "./alert-channel-types";
import { AlertPrincipalType } from "./alert-types";

export type TChannelRecipientInput = {
  principalType: AlertPrincipalType;
  principalId: string;
};

export type TCreateAlertChannelDTO = TGenericPermission & {
  name: string;
  channelType: AlertChannelType;
  config: Record<string, unknown>;
  enabled?: boolean;
  recipients?: TChannelRecipientInput[];
  projectId?: string | null;
};

export type TUpdateAlertChannelDTO = TGenericPermission & {
  channelId: string;
  name?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  recipients?: TChannelRecipientInput[];
};

export type TDeleteAlertChannelDTO = TGenericPermission & { channelId: string };

export type TGetAlertChannelDTO = TGenericPermission & { channelId: string };

export type TListAlertChannelsDTO = TGenericPermission & { projectId?: string | null };

export type TAlertChannelDetail = {
  id: string;
  name: string;
  channelType: string;
  directed: boolean;
  config: Record<string, unknown>;
  enabled: boolean;
  recipients: { principalType: string; principalId: string }[];
  usageCount: number;
  orgId: string;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TAlertChannelSummary = {
  id: string;
  name: string;
  channelType: string;
  directed: boolean;
  enabled: boolean;
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

export type { AlertChannelType };
