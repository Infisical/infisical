import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { auditLogStreamKeys } from "./queries";
import {
  TAuditLogStream,
  TCreateAuditLogStreamDTO,
  TDeleteAuditLogStreamDTO,
  TUpdateAuditLogStreamDTO
} from "./types";

export const useCreateAuditLogStream = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ provider, ...params }: TCreateAuditLogStreamDTO) => {
      const { data } = await apiRequest.post<{ auditLogStream: TAuditLogStream }>(
        `/api/v1/audit-log-streams/${provider}`,
        { ...params, provider }
      );

      return data.auditLogStream;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: auditLogStreamKeys.list() })
  });
};

export const useUpdateAuditLogStream = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ auditLogStreamId, provider, ...params }: TUpdateAuditLogStreamDTO) => {
      const { data } = await apiRequest.patch<{ auditLogStream: TAuditLogStream }>(
        `/api/v1/audit-log-streams/${provider}/${auditLogStreamId}`,
        params
      );

      return data.auditLogStream;
    },
    onSuccess: (_, { auditLogStreamId, provider }) => {
      queryClient.invalidateQueries({ queryKey: auditLogStreamKeys.list() });
      queryClient.invalidateQueries({
        queryKey: auditLogStreamKeys.getById(provider, auditLogStreamId)
      });
    }
  });
};

export const useDeleteAuditLogStream = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ auditLogStreamId, provider }: TDeleteAuditLogStreamDTO) => {
      const { data } = await apiRequest.delete<{ auditLogStream: TAuditLogStream }>(
        `/api/v1/audit-log-streams/${provider}/${auditLogStreamId}`
      );

      return data.auditLogStream;
    },
    onSuccess: (_, { auditLogStreamId, provider }) => {
      queryClient.invalidateQueries({ queryKey: auditLogStreamKeys.list() });
      queryClient.invalidateQueries({
        queryKey: auditLogStreamKeys.getById(provider, auditLogStreamId)
      });
    }
  });
};
