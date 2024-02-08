import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { GetScimTokenRes } from "./types";

const scimKeys = {
    getScimToken: (orgId: string) => [{ orgId }, "organization-scim-token"] as const,
};

export const useGetScimToken = (organizationId: string) => {
    return useQuery({
        queryKey: scimKeys.getScimToken(organizationId),
        queryFn: async () => {
            if (organizationId === "") {
                return undefined;
            }
            
            const { data: { scimToken } } = await apiRequest.get<GetScimTokenRes>(`/api/v1/scim/token/organizations/${organizationId}`);
            return scimToken;
        },
        enabled: true
    });
};