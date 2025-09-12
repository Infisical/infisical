import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAuditLogStreamProviderOption } from "./types/provider-options";
import { LogProvider } from "./enums";
import { TAuditLogStream, TAuditLogStreamProviderMap } from "./types";

export const auditLogStreamKeys = {
  all: ["audit-log-stream"] as const,
  options: () => [...auditLogStreamKeys.all, "options"] as const,
  list: () => [...auditLogStreamKeys.all, "list"] as const,
  getById: (provider: string, id: string) =>
    [...auditLogStreamKeys.all, provider, "get-by-id", id] as const
};

export const useGetAuditLogStreamOptions = (
  options?: Omit<
    UseQueryOptions<
      TAuditLogStreamProviderOption[],
      unknown,
      TAuditLogStreamProviderOption[],
      ReturnType<typeof auditLogStreamKeys.options>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: auditLogStreamKeys.options(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ providerOptions: TAuditLogStreamProviderOption[] }>(
        "/api/v1/audit-log-streams/options"
      );

      return data.providerOptions;
    },
    ...options
  });
};

export const useListAuditLogStreams = (
  options?: Omit<
    UseQueryOptions<
      TAuditLogStream[],
      unknown,
      TAuditLogStream[],
      ReturnType<typeof auditLogStreamKeys.list>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: auditLogStreamKeys.list(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ auditLogStreams: TAuditLogStream[] }>(
        "/api/v1/audit-log-streams"
      );

      return data.auditLogStreams;
    },
    ...options
  });
};

export const useGetAuditLogStreamById = <T extends LogProvider>(
  provider: T,
  logStreamId: string,
  options?: Omit<
    UseQueryOptions<
      TAuditLogStreamProviderMap[T],
      unknown,
      TAuditLogStreamProviderMap[T],
      ReturnType<typeof auditLogStreamKeys.getById>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: auditLogStreamKeys.getById(provider, logStreamId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ auditLogStream: TAuditLogStreamProviderMap[T] }>(
        `/api/v1/audit-log-streams/${provider}/${logStreamId}`
      );

      return data.auditLogStream;
    },
    ...options
  });
};
