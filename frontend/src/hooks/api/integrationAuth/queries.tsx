import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
    App,
    IntegrationAuth,
    Team} from './types';

const integrationAuthKeys = {
    getIntegrationAuthById: (integrationAuthId: string) => [{ integrationAuthId }, 'integrationAuth'] as const,
    getIntegrationAuthApps: (integrationAuthId: string, teamId?: string) => [{ integrationAuthId, teamId }, 'integrationAuthApps'] as const,
    getIntegrationAuthTeams: (integrationAuthId: string) => [{ integrationAuthId }, 'integrationAuthTeams'] as const
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
    console.log('fetchIntegrationAuthApps: ', integrationAuthId);
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

export const useGetIntegrationAuthById = (integrationAuthId: string) => {
    return useQuery({
        queryKey: integrationAuthKeys.getIntegrationAuthById(integrationAuthId),
        queryFn: () => fetchIntegrationAuthById(integrationAuthId),
        enabled: true
    });
}

// TODO: fix to teamId
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