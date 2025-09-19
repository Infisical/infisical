import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TrustedIp } from "./types";

const trustedIps = {
  getTrustedIps: (projectId: string) => [{ projectId }, "trusted-ips"] as const
};

export const useGetTrustedIps = (projectId: string) => {
  return useQuery({
    queryKey: trustedIps.getTrustedIps(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ trustedIps: TrustedIp[] }>(
        `/api/v1/projects/${projectId}/trusted-ips`
      );

      return data.trustedIps;
    }
  });
};

export const useAddTrustedIp = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      ipAddress,
      comment,
      isActive
    }: {
      projectId: string;
      ipAddress: string;
      comment?: string;
      isActive: boolean;
    }) => {
      const { data } = await apiRequest.post(`/api/v1/projects/${projectId}/trusted-ips`, {
        ipAddress,
        ...(comment ? { comment } : {}),
        isActive
      });

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({ queryKey: trustedIps.getTrustedIps(dto.projectId) });
    }
  });
};

export const useUpdateTrustedIp = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      trustedIpId,
      ipAddress,
      comment,
      isActive
    }: {
      projectId: string;
      trustedIpId: string;
      ipAddress: string;
      comment?: string;
      isActive: boolean;
    }) => {
      const { data } = await apiRequest.patch(
        `/api/v1/projects/${projectId}/trusted-ips/${trustedIpId}`,
        {
          ipAddress,
          ...(comment ? { comment } : {}),
          isActive
        }
      );

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({ queryKey: trustedIps.getTrustedIps(dto.projectId) });
    }
  });
};

export const useDeleteTrustedIp = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, trustedIpId }: { projectId: string; trustedIpId: string }) => {
      const { data } = await apiRequest.delete(
        `/api/v1/projects/${projectId}/trusted-ips/${trustedIpId}`
      );

      return data;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({ queryKey: trustedIps.getTrustedIps(dto.projectId) });
    }
  });
};
