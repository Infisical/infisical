import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
    App,
    IntegrationAuth} from './types';

const integrationAuthKeys = {
    getIntegrationAuthById: (integrationAuthId: string) => [{ integrationAuthId }, 'integrationAuth'] as const,
    getIntegrationAuthApps: (integrationAuthId: string) => [{ integrationAuthId }, 'integrationAuthApps'] as const,
}

const fetchIntegrationAuthById = async (integrationAuthId: string) => {
    const { data } = await apiRequest.get<{ integrationAuth: IntegrationAuth }>(`/api/v1/integration-auth/${integrationAuthId}`);
    return data.integrationAuth;
}

const fetchIntegrationAuthApps = async (integrationAuthId: string) => {
    const { data } = await apiRequest.get<{ apps: App[] }>(`/api/v1/integration-auth/${integrationAuthId}/apps`);
    return data.apps;
}

export const useGetIntegrationAuthById = (integrationAuthId: string) => {
    return useQuery({
        queryKey: integrationAuthKeys.getIntegrationAuthById(integrationAuthId),
        queryFn: () => fetchIntegrationAuthById(integrationAuthId),
        enabled: true
    });
}

export const useGetIntegrationAuthApps = (integrationAuthId: string) => {
    return useQuery({
        queryKey: integrationAuthKeys.getIntegrationAuthApps(integrationAuthId),
        queryFn: () =>  fetchIntegrationAuthApps(integrationAuthId),
        enabled: true
    });
}