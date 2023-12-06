import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { organizationKeys } from "../organization/queries";
import { machineIdentityKeys } from "./queries";
import {
    CreateMachineIdentityClientSecretDTO,
    CreateMachineIdentityClientSecretRes,
    CreateMachineIdentityDTO,
    CreateMachineIdentityRes,
    DeleteMachineIdentityDTO,
    MachineIdentity,
    UpdateMachineIdentityDTO,
} from "./types";

export const useCreateMachineIdentity = () => {
    const queryClient = useQueryClient();
    return useMutation<CreateMachineIdentityRes, {}, CreateMachineIdentityDTO>({
        mutationFn: async (body) => {
            const { data } = await apiRequest.post("/api/v1/machine-identities/", body);
            return data;
        },
        onSuccess: ({ machineIdentity }) => {
            queryClient.invalidateQueries(organizationKeys.getOrgServiceMemberships(machineIdentity.organization));
        }
    });
};

export const useCreateMachineIdentityClientSecret = () => {
    const queryClient = useQueryClient();
    return useMutation<CreateMachineIdentityClientSecretRes, {}, CreateMachineIdentityClientSecretDTO>({
        mutationFn: async ({
            machineId,
            description,
            ttl,
            numUsesLimit
        }) => {

            const { data } = await apiRequest.post(`/api/v1/machine-identities/${machineId}/client-secrets`, {
                machineId,
                description,
                ttl,
                numUsesLimit
            });

            return data;
        },
        onSuccess: (_, { machineId }) => {
            queryClient.invalidateQueries(machineIdentityKeys.getMachineIdentityClientSecrets(machineId));
        }
    });
};

export const useDeleteMachineIdentityClientSecret = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            machineId,
            clientSecretId
        }: {
            machineId:string;
            clientSecretId: string;
        }) => {
            const { data } = await apiRequest.post(`/api/v1/machine-identities/${machineId}/client-secrets/${clientSecretId}/revoke`);
            return data;
        },
        onSuccess: (_, { machineId }) => {
            queryClient.invalidateQueries(machineIdentityKeys.getMachineIdentityClientSecrets(machineId));
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
            clientSecretTrustedIps,
            accessTokenTrustedIps,
            accessTokenTTL,
            accessTokenNumUsesLimit
        }) => {
            
            const { data: { machineIdentity } } = await apiRequest.patch(`/api/v1/machine-identities/${machineId}`, {
                name,
                role,
                clientSecretTrustedIps,
                accessTokenTrustedIps,
                accessTokenTTL,
                accessTokenNumUsesLimit
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
            const { data: { machineIdentity } } = await apiRequest.delete(`/api/v1/machine-identities/${machineId}`);
            return machineIdentity;
        },
        onSuccess: ({ organization }) => {
            queryClient.invalidateQueries(organizationKeys.getOrgServiceMemberships(organization));
        }
    });
};