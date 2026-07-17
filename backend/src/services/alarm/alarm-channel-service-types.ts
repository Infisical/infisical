import { TGenericPermission } from "@app/lib/types";

import { AlarmChannelType } from "./alarm-channel-types";
import { AlarmPrincipalType } from "./alarm-types";

export type TChannelRecipientInput = {
  principalType: AlarmPrincipalType;
  principalId: string;
};

export type TCreateAlarmChannelDTO = TGenericPermission & {
  name: string;
  channelType: AlarmChannelType;
  config: Record<string, unknown>;
  enabled?: boolean;
  recipients?: TChannelRecipientInput[];
  projectId?: string | null;
};

export type TUpdateAlarmChannelDTO = TGenericPermission & {
  channelId: string;
  name?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
  recipients?: TChannelRecipientInput[];
};

export type TDeleteAlarmChannelDTO = TGenericPermission & { channelId: string };

export type TGetAlarmChannelDTO = TGenericPermission & { channelId: string };

export type TListAlarmChannelsDTO = TGenericPermission & { projectId?: string | null };

export type TAlarmChannelDetail = {
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

// Lightweight reference embedded in an alarm response (the alarm no longer owns config/recipients).
export type TAlarmChannelSummary = {
  id: string;
  name: string;
  channelType: string;
  directed: boolean;
  enabled: boolean;
};

export type { AlarmChannelType };
