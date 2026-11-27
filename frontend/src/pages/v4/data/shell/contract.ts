import type { TServerConfig } from "@app/hooks/api/admin/types";
import type { ActorType } from "@app/hooks/api/auditLogs/enums";
import type { TAuditLogStream } from "@app/hooks/api/auditLogStreams/types";
import type { TCertManagerInstanceState } from "@app/hooks/api/certManagerInstance";
import type { TGatewayV2 } from "@app/hooks/api/gateways-v2/types";
import type { TUserNotification } from "@app/hooks/api/notifications/types";
import type { TRelay } from "@app/hooks/api/relays/types";
import type { ServerStatus } from "@app/hooks/api/serverDetails/types";
import type { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";
import type { OrgUser } from "@app/hooks/api/users/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type AssumedPrivileges = {
  actorId: string;
  actorType: ActorType;
  actorEmail: string;
  actorName: string | null;
};

export type CertManagerInstance = TCertManagerInstanceState & { viewingProjectId: string | null };

export type ShellAdapter = {
  useServerStatus: () => V4QueryResult<ServerStatus>;
  useServerConfig: () => V4QueryResult<TServerConfig>;
  useSubscription: (orgId: string) => V4QueryResult<SubscriptionPlan>;
  useAuditLogStreams: (enabled: boolean) => V4QueryResult<TAuditLogStream[]>;
  useConnectedGateways: (enabled: boolean) => V4QueryResult<TGatewayV2[]>;
  useRelays: (enabled: boolean) => V4QueryResult<TRelay[]>;
  useIsSecureContext: () => boolean;
  usePlatformVersion: () => string | undefined;
  useAssumedPrivileges: (projectId: string) => V4QueryResult<AssumedPrivileges | null>;
  useExitAssumedPrivileges: V4Mutation<{ projectId: string }>;
  useCertManagerInstance: (orgId: string) => V4QueryResult<CertManagerInstance>;
  useNotifications: (orgId: string) => V4QueryResult<TUserNotification[]>;
  useMarkAllNotificationsRead: V4Mutation<{ orgId: string }>;
  useMarkNotificationsRead: V4Mutation<{ orgId: string; notificationIds: string[] }>;
  useDeleteNotifications: V4Mutation<{ orgId: string; notificationIds: string[] }>;
  useDeleteAllNotifications: V4Mutation<{ orgId: string }>;
  useServerAdmins: (orgId: string, enabled: boolean) => V4QueryResult<OrgUser["user"][]>;
};
