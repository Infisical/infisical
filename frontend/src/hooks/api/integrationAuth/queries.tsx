import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
    App,
    IntegrationAuth,
    Team
} from './types';

const integrationAuthKeys = {
    getIntegrationAuthById: (integrationAuthId: string) => [{ integrationAuthId }, 'integrationAuth'] as const,
    getIntegrationAuthApps: (integrationAuthId: string, teamId?: string) => [{ integrationAuthId, teamId }, 'integrationAuthApps'] as const,
    getIntegrationAuthTeams: (integrationAuthId: string) => [{ integrationAuthId }, 'integrationAuthTeams'] as const,
    getIntegrationAuthVercelBranches: ({
        integrationAuthId,
        appId,
    }: {
        integrationAuthId: string;
        appId: string;
    }) => [{ integrationAuthId, appId }, 'integrationAuthVercelBranches']
}

const fetchIntegrationAuthById = async (integrationAuthId: string) => {
    const { data } = await apiRequest.get<{ integrationAuth: IntegrationAuth }>(`/api/v1/integration-auth/${integrationAuthId}`);
    return data.integrationAuth;
}

const fetchIntegrationAuthApps = async ({
    integrationAuthId,
    teamId
}: {
    integrationAuthId: string;
    teamId?: string;
}) => {
    const searchParams = new URLSearchParams(teamId ? { teamId } : undefined);
    const { data } = await apiRequest.get<{ apps: App[] }>(
        `/api/v1/integration-auth/${integrationAuthId}/apps`, 
        { params: searchParams }
    );
    return data.apps;
}

const fetchIntegrationAuthTeams = async (integrationAuthId: string) => {
    const { data } = await apiRequest.get<{ teams: Team[] }>(`/api/v1/integration-auth/${integrationAuthId}/teams`);
    return data.teams;
}

const fetchIntegrationAuthVercelBranches = async ({
    integrationAuthId,
    appId
}: {
    integrationAuthId: string;
    appId: string;
}) => {
    const { data: { branches } } = await apiRequest.get<{ branches: string[] }>(`/api/v1/integration-auth/${integrationAuthId}/vercel/branches`, {
        params: {
            appId
        }
    });
    
    return branches;
};

export const useGetIntegrationAuthById = (integrationAuthId: string) => {
    return useQuery({
        queryKey: integrationAuthKeys.getIntegrationAuthById(integrationAuthId),
        queryFn: () => fetchIntegrationAuthById(integrationAuthId),
        enabled: true
    });
}

export const useGetIntegrationAuthApps = ({
    integrationAuthId,
    teamId
}: {
    integrationAuthId: string;
    teamId?: string;
}) => {
    return useQuery({
        queryKey: integrationAuthKeys.getIntegrationAuthApps(integrationAuthId, teamId),
        queryFn: () =>  fetchIntegrationAuthApps({
            integrationAuthId,
            teamId
        }),
        enabled: true
    });
}

export const useGetIntegrationAuthTeams = (integrationAuthId: string) => {
    return useQuery({
        queryKey: integrationAuthKeys.getIntegrationAuthTeams(integrationAuthId),
        queryFn: () =>  fetchIntegrationAuthTeams(integrationAuthId),
        enabled: true
    });
}

export const useGetIntegrationAuthVercelBranches = ({
    integrationAuthId,
    appId,
}: {
    integrationAuthId: string;
    appId: string;
}) => {
    return useQuery({
        queryKey: integrationAuthKeys.getIntegrationAuthVercelBranches({
            integrationAuthId,
            appId,
        }),
        queryFn: () => fetchIntegrationAuthVercelBranches({
            integrationAuthId,
            appId,
        }),
        enabled: true
    });
}
