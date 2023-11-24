import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { organizationKeys } from "../organization/queries";
import {
    CreateMachineIdentityDTO,
    CreateMachineIdentityRes,
    DeleteMachineIdentityDTO,
    MachineIdentity,
    UpdateMachineIdentityDTO} from "./types";

export const useCreateMachineIdentity = () => {
    const queryClient = useQueryClient();
    return useMutation<CreateMachineIdentityRes, {}, CreateMachineIdentityDTO>({
        mutationFn: async (body) => {
            const { data } = await apiRequest.post("/api/v3/machines/", body);
            return data;
        },
            onSuccess: ({ machineIdentity }) => {
            queryClient.invalidateQueries(organizationKeys.getOrgServiceMemberships(machineIdentity.organization));
        }
    });
};

export const useUpdateMachineIdentity = () => {
    const queryClient = useQueryClient();
    return useMutation<MachineIdentity, {}, UpdateMachineIdentityDTO>({
        mutationFn: async ({
            machineId,
            name,
            role,
            isActive,
            trustedIps,
            expiresIn,
            accessTokenTTL,
            isRefreshTokenRotationEnabled
        }) => {
            
            const { data: { machineIdentity } } = await apiRequest.patch(`/api/v3/machines/${machineId}`, {
                name,
                role,
                isActive,
                trustedIps,
                expiresIn,
                accessTokenTTL,
                isRefreshTokenRotationEnabled
            });

            return machineIdentity;
        },
        onSuccess: ({ organization }) => {
            queryClient.invalidateQueries(organizationKeys.getOrgServiceMemberships(organization));
        }
    });
};

export const useDeleteMachineIdentity = () => {
    const queryClient = useQueryClient();
    return useMutation<MachineIdentity, {}, DeleteMachineIdentityDTO>({
        mutationFn: async ({
            machineId
        }) => {
            const { data: { machineIdentity } } = await apiRequest.delete(`/api/v3/machines/${machineId}`);
            return machineIdentity;
        },
        onSuccess: ({ organization }) => {
            queryClient.invalidateQueries(organizationKeys.getOrgServiceMemberships(organization));
        }
    });
};