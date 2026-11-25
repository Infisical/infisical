import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import { envConfig } from "@app/config/env";
import { apiRequest } from "@app/config/request";
import { resolveCertManagerProjectId } from "@app/helpers/certManagerActiveProject";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useGetServerConfig } from "@app/hooks/api/admin/queries";
import { useRemoveAssumeProjectPrivilege } from "@app/hooks/api/assumePrivileges/mutations";
import { useListAuditLogStreams } from "@app/hooks/api/auditLogStreams/queries";
import {
  certManagerInstanceKeys,
  fetchCertManagerInstanceState
} from "@app/hooks/api/certManagerInstance";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import { notificationKeys } from "@app/hooks/api/notifications/queries";
import type { TUserNotification } from "@app/hooks/api/notifications/types";
import { useGetUserProjects } from "@app/hooks/api/projects/queries";
import { relayQueryKeys } from "@app/hooks/api/relays/queries";
import type { TRelay } from "@app/hooks/api/relays/types";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";
import { useGetOrgUsers } from "@app/hooks/api/users/queries";

import type { ShellAdapter } from "./contract";

const useNotificationMutation = <TVariables extends { orgId: string }>(
  run: (variables: TVariables) => Promise<unknown>
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSettled: (_, __, { orgId }) =>
      queryClient.invalidateQueries({ queryKey: notificationKeys.list(orgId) })
  });
};

const RATE_LIMIT_RETRIES = 5;
const RATE_LIMIT_FALLBACK_MS = 10_000;

const rateLimitWait = (error: unknown) => {
  if (!isAxiosError(error) || error.response?.status !== 429) return undefined;
  const seconds = Number(error.response.headers["retry-after"]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : RATE_LIMIT_FALLBACK_MS;
};

// The notification API has no bulk endpoint and each write counts against the per-minute write
// limit, so a grouped row's requests run one at a time and wait out a 429 instead of failing midway.
const eachPaced = async (ids: string[], run: (id: string) => Promise<unknown>) => {
  for (const id of ids) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await run(id);
        break;
      } catch (error) {
        const wait = rateLimitWait(error);
        if (wait === undefined || attempt >= RATE_LIMIT_RETRIES) throw error;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, wait);
        });
      }
    }
  }
};

export const shellLive: ShellAdapter = {
  useServerStatus: useFetchServerStatus,
  useServerConfig: () => useGetServerConfig(),
  useSubscription: (orgId) => useGetOrgSubscription({ orgID: orgId }),
  useAuditLogStreams: (enabled) => useListAuditLogStreams({ enabled }),
  useConnectedGateways: (enabled) => useQuery({ ...gatewaysQueryKeys.list(), enabled }),
  useRelays: (enabled) =>
    useQuery({
      queryKey: relayQueryKeys.list(),
      queryFn: async () => (await apiRequest.get<TRelay[]>("/api/v1/relays")).data,
      enabled
    }),
  useIsSecureContext: () => window.isSecureContext,
  usePlatformVersion: () => {
    const version = envConfig.PLATFORM_VERSION;
    if (!version || isInfisicalCloud() || /^[0-9a-f]{7}$/i.test(version)) return undefined;
    return version;
  },
  useAssumedPrivileges: (projectId) =>
    useQuery({
      queryKey: roleQueryKeys.getUserProjectPermissions({ projectId }),
      queryFn: () => fetchUserProjectPermissions({ projectId }),
      enabled: Boolean(projectId),
      select: (data) => data.assumedPrivilegeDetails ?? null
    }),
  useExitAssumedPrivileges: useRemoveAssumeProjectPrivilege,
  useCertManagerInstance: (orgId) => {
    const state = useQuery({
      queryKey: certManagerInstanceKeys.state(orgId),
      queryFn: fetchCertManagerInstanceState
    });
    const { data: projects } = useGetUserProjects();
    return {
      data:
        state.data && projects
          ? {
              ...state.data,
              viewingProjectId: resolveCertManagerProjectId({
                orgId,
                activeProjectId: state.data.activeProjectId,
                memberProjectIds: projects.map((project) => project.id)
              })
            }
          : undefined,
      isPending: state.isPending || !projects,
      error: state.error
    };
  },
  useNotifications: (orgId) =>
    useQuery({
      queryKey: notificationKeys.list(orgId),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ notifications: TUserNotification[] }>(
          "/api/v1/notifications/user"
        );
        return data.notifications;
      },
      refetchInterval: 30_000
    }),
  useMarkAllNotificationsRead: () =>
    useNotificationMutation(() => apiRequest.post("/api/v1/notifications/user/mark-as-read")),
  useMarkNotificationsRead: () =>
    useNotificationMutation(({ notificationIds }: { orgId: string; notificationIds: string[] }) =>
      eachPaced(notificationIds, (id) =>
        apiRequest.patch(`/api/v1/notifications/user/${id}`, { isRead: true })
      )
    ),
  useDeleteNotifications: () =>
    useNotificationMutation(({ notificationIds }: { orgId: string; notificationIds: string[] }) =>
      eachPaced(notificationIds, (id) => apiRequest.delete(`/api/v1/notifications/user/${id}`))
    ),
  useDeleteAllNotifications: () =>
    useNotificationMutation(() => apiRequest.delete("/api/v1/notifications/user")),
  useServerAdmins: (orgId, enabled) => {
    const { data, isPending, error } = useGetOrgUsers(orgId, { enabled });
    return {
      data: data?.filter((member) => member.user.superAdmin).map((member) => member.user),
      isPending,
      error
    };
  }
};
