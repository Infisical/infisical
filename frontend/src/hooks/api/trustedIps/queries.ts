import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
    TrustedIp
} from "./types";

const trustedIps = {
    getTrustedIps: (workspaceId: string) => [{ workspaceId }, "trusted-ips"] as const
}

export const useGetTrustedIps = (workspaceId: string) => {
    return useQuery({ 
        queryKey: trustedIps.getTrustedIps(workspaceId), 
        queryFn: async () => {
            const { data } = await apiRequest.get<{ trustedIps: TrustedIp[] }>(`/api/v1/workspace/${workspaceId}/trusted-ips`);

            return data.trustedIps;
        }
    });
}

export const useAddTrustedIp = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            workspaceId,
            ipAddress,
            comment,
            isActive
        }: {
            workspaceId: string;
            ipAddress: string;
            comment?: string;
            isActive: boolean;
        }) => {
            const { data } = await apiRequest.post(
                `/api/v1/workspace/${workspaceId}/trusted-ips`, 
                {
                    ipAddress,
                    ...(comment ? { comment } : {}),
                    isActive
                }
            );

            return data;
        },
            onSuccess(_, dto) {
            queryClient.invalidateQueries(trustedIps.getTrustedIps(dto.workspaceId));
        }
    });
};

export const useUpdateTrustedIp = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            workspaceId,
            trustedIpId,
            ipAddress,
            comment,
            isActive
        }: {
            workspaceId: string;
            trustedIpId: string;
            ipAddress: string;
            comment?: string;
            isActive: boolean;
        }) => {
            const { data } = await apiRequest.patch(
                `/api/v1/workspace/${workspaceId}/trusted-ips/${trustedIpId}`,
                {
                    ipAddress,
                    ...(comment ? { comment } : {}),
                    isActive
                }
            );

            return data;
        },
            onSuccess(_, dto) {
            queryClient.invalidateQueries(trustedIps.getTrustedIps(dto.workspaceId));
        }
    });
};

export const useDeleteTrustedIp = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            workspaceId,
            trustedIpId,
        }: {
            workspaceId: string;
            trustedIpId: string;
        }) => {
            const { data } = await apiRequest.delete(
                `/api/v1/workspace/${workspaceId}/trusted-ips/${trustedIpId}`
            );

            return data;
        },
            onSuccess(_, dto) {
            queryClient.invalidateQueries(trustedIps.getTrustedIps(dto.workspaceId));
        }
    });
};