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

  return useMutation<{ auditLogStream: TAuditLogStream }, object, TCreateAuditLogStreamDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.post<{ auditLogStream: TAuditLogStream }>(
        "/api/v1/audit-log-streams",
        dto
      );
      return data;
    },
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: auditLogStreamKeys.list(orgId) });
    }
  });
};

export const useUpdateAuditLogStream = () => {
  const queryClient = useQueryClient();

  return useMutation<{ auditLogStream: TAuditLogStream }, object, TUpdateAuditLogStreamDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.patch<{ auditLogStream: TAuditLogStream }>(
        `/api/v1/audit-log-streams/${dto.id}`,
        dto
      );
      return data;
    },
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: auditLogStreamKeys.list(orgId) });
    }
  });
};

export const useDeleteAuditLogStream = () => {
  const queryClient = useQueryClient();

  return useMutation<{ auditLogStream: TAuditLogStream }, object, TDeleteAuditLogStreamDTO>({
    mutationFn: async (dto) => {
      const { data } = await apiRequest.delete<{ auditLogStream: TAuditLogStream }>(
        `/api/v1/audit-log-streams/${dto.id}`
      );
      return data;
    },
    onSuccess: (_, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: auditLogStreamKeys.list(orgId) });
    }
  });
};
