import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/queries";
import { 
  App, 
  BitBucketWorkspace, 
  Environment, 
  IntegrationAuth, 
  NorthflankSecretGroup,
  Service, 
  Team 
} from "./types";

const integrationAuthKeys = {
  getIntegrationAuthById: (integrationAuthId: string) =>
    [{ integrationAuthId }, "integrationAuth"] as const,
  getIntegrationAuthApps: (integrationAuthId: string, teamId?: string, workspaceSlug?: string) =>
    [{ integrationAuthId, teamId, workspaceSlug }, "integrationAuthApps"] as const,
  getIntegrationAuthTeams: (integrationAuthId: string) =>
    [{ integrationAuthId }, "integrationAuthTeams"] as const,
  getIntegrationAuthVercelBranches: ({
    integrationAuthId,
    appId
  }: {
    integrationAuthId: string;
    appId: string;
  }) => [{ integrationAuthId, appId }, "integrationAuthVercelBranches"] as const,
  getIntegrationAuthRailwayEnvironments: ({
    integrationAuthId,
    appId
  }: {
    integrationAuthId: string;
    appId: string;
  }) => [{ integrationAuthId, appId }, "integrationAuthRailwayEnvironments"] as const,
  getIntegrationAuthRailwayServices: ({
    integrationAuthId,
    appId
  }: {
    integrationAuthId: string;
    appId: string;
  }) => [{ integrationAuthId, appId }, "integrationAuthRailwayServices"] as const,
  getIntegrationAuthBitBucketWorkspaces: (integrationAuthId: string) =>
    [{ integrationAuthId }, "integrationAuthBitbucketWorkspaces"] as const,
  getIntegrationAuthNorthflankSecretGroups: ({
    integrationAuthId,
    appId
  }: {
    integrationAuthId: string;
    appId: string;
  }) => [{ integrationAuthId, appId }, "integrationAuthNorthflankSecretGroups"] as const, 
};

const fetchIntegrationAuthById = async (integrationAuthId: string) => {
  const { data } = await apiRequest.get<{ integrationAuth: IntegrationAuth }>(
    `/api/v1/integration-auth/${integrationAuthId}`
  );
  return data.integrationAuth;
};

const fetchIntegrationAuthApps = async ({
  integrationAuthId,
  teamId,
  workspaceSlug
}: {
  integrationAuthId: string;
  teamId?: string;
  workspaceSlug?: string;
}) => {
  const params: Record<string, string> = {}
  if (teamId) {
    params.teamId = teamId
  }
  if (workspaceSlug) {
    params.workspaceSlug = workspaceSlug
  }

  const searchParams = new URLSearchParams(params);
  const { data } = await apiRequest.get<{ apps: App[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/apps`,
    { params: searchParams }
  );
  return data.apps;
};

const fetchIntegrationAuthTeams = async (integrationAuthId: string) => {
  const { data } = await apiRequest.get<{ teams: Team[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/teams`
  );
  return data.teams;
};


const fetchIntegrationAuthVercelBranches = async ({
  integrationAuthId,
  appId
}: {
  integrationAuthId: string;
  appId: string;
}) => {
  const {
    data: { branches }
  } = await apiRequest.get<{ branches: string[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/vercel/branches`,
    {
      params: {
        appId
      }
    }
  );

  return branches;
};

const fetchIntegrationAuthRailwayEnvironments = async ({
  integrationAuthId,
  appId
}: {
  integrationAuthId: string;
  appId: string;
}) => {
  const {
    data: { environments }
  } = await apiRequest.get<{ environments: Environment[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/railway/environments`,
    {
      params: {
        appId
      }
    }
  );

  return environments;
};

const fetchIntegrationAuthRailwayServices = async ({
  integrationAuthId,
  appId
}: {
  integrationAuthId: string;
  appId: string;
}) => {
  const {
    data: { services }
  } = await apiRequest.get<{ services: Service[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/railway/services`,
    {
      params: {
        appId
      }
    }
  );

  return services;
};

const fetchIntegrationAuthBitBucketWorkspaces = async (integrationAuthId: string) => {
  const { data: { workspaces } } = await apiRequest.get<{ workspaces: BitBucketWorkspace[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/bitbucket/workspaces`
  );
  return workspaces;
};

const fetchIntegrationAuthNorthflankSecretGroups = async ({
  integrationAuthId,
  appId
}: {
  integrationAuthId: string;
  appId: string;
}) => {
  const {
    data: { secretGroups }
  } = await apiRequest.get<{ secretGroups: NorthflankSecretGroup[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/northflank/secret-groups`,
    {
      params: {
        appId
      }
    }
  );

  return secretGroups;
};

export const useGetIntegrationAuthById = (integrationAuthId: string) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthById(integrationAuthId),
    queryFn: () => fetchIntegrationAuthById(integrationAuthId),
    enabled: true
  });
};

export const useGetIntegrationAuthApps = ({
  integrationAuthId,
  teamId,
  workspaceSlug,
}: {
  integrationAuthId: string;
  teamId?: string;
  workspaceSlug?: string;
}) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthApps(integrationAuthId, teamId, workspaceSlug),
    queryFn: () =>
      fetchIntegrationAuthApps({
        integrationAuthId,
        teamId,
        workspaceSlug
      }),
    enabled: true
  });
};

export const useGetIntegrationAuthTeams = (integrationAuthId: string) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthTeams(integrationAuthId),
    queryFn: () => fetchIntegrationAuthTeams(integrationAuthId),
    enabled: true
  });
};

export const useGetIntegrationAuthVercelBranches = ({
  integrationAuthId,
  appId
}: {
  integrationAuthId: string;
  appId: string;
}) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthVercelBranches({
      integrationAuthId,
      appId
    }),
    queryFn: () =>
      fetchIntegrationAuthVercelBranches({
        integrationAuthId,
        appId
      }),
    enabled: true
  });
};

export const useGetIntegrationAuthRailwayEnvironments = ({
  integrationAuthId,
  appId
}: {
  integrationAuthId: string;
  appId: string;
}) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthRailwayEnvironments({
      integrationAuthId,
      appId
    }),
    queryFn: () =>
      fetchIntegrationAuthRailwayEnvironments({
        integrationAuthId,
        appId
      }),
    enabled: true
  });
};

export const useGetIntegrationAuthRailwayServices = ({
  integrationAuthId,
  appId
}: {
  integrationAuthId: string;
  appId: string;
}) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthRailwayServices({
      integrationAuthId,
      appId
    }),
    queryFn: () =>
      fetchIntegrationAuthRailwayServices({
        integrationAuthId,
        appId
      }),
    enabled: true
  });
};

export const useGetIntegrationAuthBitBucketWorkspaces = (integrationAuthId: string) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthBitBucketWorkspaces(integrationAuthId),
    queryFn: () => fetchIntegrationAuthBitBucketWorkspaces(integrationAuthId),
    enabled: true
  });
};

export const useGetIntegrationAuthNorthflankSecretGroups = ({
  integrationAuthId,
  appId
}: {
  integrationAuthId: string;
  appId: string;
}) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthNorthflankSecretGroups({
      integrationAuthId,
      appId
    }),
    queryFn: () =>
      fetchIntegrationAuthNorthflankSecretGroups({
        integrationAuthId,
        appId
      }),
    enabled: true
  });
};

export const useDeleteIntegrationAuth = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, { id: string; workspaceId: string }>({
    mutationFn: ({ id }) => apiRequest.delete(`/api/v1/integration-auth/${id}`),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceAuthorization(workspaceId));
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceIntegrations(workspaceId));
    }
  });
};

