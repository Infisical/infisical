import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
    MachineIdentityClientSecret
} from "./types";

export const machineIdentityKeys = {
    getMachineIdentityClientSecrets: (machineId: string) => [{ machineId }, "machine-identity-client-secrets"] as const
}

export const useGetMachineIdentityClientSecrets = (machineId: string) => {
    return useQuery({
        queryKey: machineIdentityKeys.getMachineIdentityClientSecrets(machineId),
        queryFn: async () => {
            if (machineId === "") return [];

            const { data: { clientSecretData } } = await apiRequest.get<{ clientSecretData: MachineIdentityClientSecret[] }>(
                `/api/v1/machine-identities/${machineId}/client-secrets`
            );
        
            return clientSecretData;
        }
    });
}