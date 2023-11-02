import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/queries";
import { 
  App, 
  BitBucketWorkspace, 
  ChecklyGroup, 
  Environment, 
  IntegrationAuth, 
  NorthflankSecretGroup,
  Org,
  Project,
  Service, 
  Team,
  TeamCityBuildConfig
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
  getIntegrationAuthChecklyGroups: ({
    integrationAuthId,
    accountId
  }: {
    integrationAuthId: string;
    accountId: string;
  }) => 
  [{ integrationAuthId, accountId }, "integrationAuthChecklyGroups"] as const,
  getIntegrationAuthQoveryOrgs: (integrationAuthId: string) => 
  [{ integrationAuthId }, "integrationAuthQoveryOrgs"] as const,
  getIntegrationAuthQoveryProjects: ({
    integrationAuthId,
    orgId
  }: {
    integrationAuthId: string;
    orgId: string;
  }) => [{ integrationAuthId, orgId }, "integrationAuthQoveryProjects"] as const,
  getIntegrationAuthQoveryEnvironments: ({
    integrationAuthId,
    projectId
  }: {
    integrationAuthId: string;
    projectId: string;
  }) => [{ integrationAuthId, projectId }, "integrationAuthQoveryEnvironments"] as const,
  getIntegrationAuthQoveryScopes: ({
    integrationAuthId,
    environmentId,
    scope
  }: {
    integrationAuthId: string;
    environmentId: string;
    scope: "job" | "application" | "container";
  }) => [{ integrationAuthId, environmentId, scope }, "integrationAuthQoveryScopes"] as const,
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
  getIntegrationAuthTeamCityBuildConfigs: ({
    integrationAuthId,
    appId
  }: {
    integrationAuthId: string;
    appId: string;
  }) => [{ integrationAuthId, appId }, "integrationAuthTeamCityBranchConfigs"] as const, 
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

const fetchIntegrationAuthChecklyGroups = async ({
  integrationAuthId,
  accountId
}: {
  integrationAuthId: string;
  accountId: string;
}) => {
  const { data } = await apiRequest.get<{ groups: ChecklyGroup[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/checkly/groups`,
    {
      params: {
        accountId
      }
    }
  );

  return data.groups;
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

const fetchIntegrationAuthQoveryOrgs = async (integrationAuthId: string) => {
  const {
    data: { orgs }
  } = await apiRequest.get<{ orgs: Org[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/qovery/orgs`
  );

  return orgs;
};

const fetchIntegrationAuthQoveryProjects = async ({
  integrationAuthId,
  orgId
}: {
  integrationAuthId: string;
  orgId: string;
}) => {
  if (orgId === "none") return [];
  
  const {
    data: { projects }
  } = await apiRequest.get<{ projects: Project[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/qovery/projects`,
    {
      params: {
        orgId
      }
    }
  );

  return projects;
};

const fetchIntegrationAuthQoveryEnvironments = async ({
  integrationAuthId,
  projectId
}: {
  integrationAuthId: string;
  projectId: string;
}) => {
  if (projectId === "none") return [];

  const {
    data: { environments }
  } = await apiRequest.get<{ environments: Environment[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/qovery/environments`,
    {
      params: {
        projectId
      }
    }
  );

  return environments;
};

const fetchIntegrationAuthQoveryScopes = async ({
  integrationAuthId,
  environmentId,
  scope
}: {
  integrationAuthId: string;
  environmentId: string;
  scope: "job" | "application" | "container";
}) => {
  if (environmentId === "none") return [];
  
  if (scope === "application") {
    const {
      data: { apps }
    } = await apiRequest.get<{ apps: App[] }>(
      `/api/v1/integration-auth/${integrationAuthId}/qovery/apps`,
      {
        params: {
          environmentId
        }
      }
    );

    return apps;
  } 
  
  if (scope === "container") {
    const {
      data: { containers }
    } = await apiRequest.get<{ containers: App[] }>(
      `/api/v1/integration-auth/${integrationAuthId}/qovery/containers`,
      {
        params: {
          environmentId
        }
      }
    );

    return containers;
  }

  if (scope === "job") {
    const {
      data: { jobs }
    } = await apiRequest.get<{ jobs: App[] }>(
      `/api/v1/integration-auth/${integrationAuthId}/qovery/jobs`,
      {
        params: {
          environmentId
        }
      }
    );

    return jobs;
  }

  return undefined;
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

const fetchIntegrationAuthTeamCityBuildConfigs = async ({
  integrationAuthId,
  appId
}: {
  integrationAuthId: string;
  appId: string;
}) => {
  if (appId === "") return [];

  const {
    data: { buildConfigs }
  } = await apiRequest.get<{ buildConfigs: TeamCityBuildConfig[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/teamcity/build-configs`,
    {
      params: {
        appId
      }
    }
  );

  return buildConfigs;
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

export const useGetIntegrationAuthChecklyGroups = ({
  integrationAuthId,
  accountId
}: {
  integrationAuthId: string;
  accountId: string;
}) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthChecklyGroups({
      integrationAuthId,
      accountId
    }),
    queryFn: () => fetchIntegrationAuthChecklyGroups({
      integrationAuthId,
      accountId
    }),
    enabled: true
  });
};

export const useGetIntegrationAuthQoveryOrgs = (integrationAuthId: string) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthQoveryOrgs(integrationAuthId),
    queryFn: () =>
      fetchIntegrationAuthQoveryOrgs(integrationAuthId),
    enabled: true
  });
};

export const useGetIntegrationAuthQoveryProjects = ({
  integrationAuthId,
  orgId
}: {
  integrationAuthId: string;
  orgId: string;
}) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthQoveryProjects({
      integrationAuthId,
      orgId
    }),
    queryFn: () =>
      fetchIntegrationAuthQoveryProjects({
        integrationAuthId,
        orgId
      }),
    enabled: true
  });
};

export const useGetIntegrationAuthQoveryEnvironments = ({
  integrationAuthId,
  projectId
}: {
  integrationAuthId: string;
  projectId: string;
}) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthQoveryEnvironments({
      integrationAuthId,
      projectId
    }),
    queryFn: () =>
      fetchIntegrationAuthQoveryEnvironments({
        integrationAuthId,
        projectId
      }),
    enabled: true
  });
};

export const useGetIntegrationAuthQoveryScopes = ({
  integrationAuthId,
  environmentId,
  scope
}: {
  integrationAuthId: string;
  environmentId: string;
  scope: "job" | "application" | "container";
}) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthQoveryScopes({
      integrationAuthId,
      environmentId,
      scope
    }),
    queryFn: () =>
      fetchIntegrationAuthQoveryScopes({
        integrationAuthId,
        environmentId,
        scope
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

export const useGetIntegrationAuthTeamCityBuildConfigs = ({
  integrationAuthId,
  appId
}: {
  integrationAuthId: string;
  appId: string;
}) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthTeamCityBuildConfigs({
      integrationAuthId,
      appId
    }),
    queryFn: () => fetchIntegrationAuthTeamCityBuildConfigs({
      integrationAuthId,
      appId
    }),
    enabled: true
  });
};

export const useAuthorizeIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      code,
      integration,
      url
    }: {
      workspaceId: string;
      code: string;
      integration: string;
      url?: string;
    }) => {
      const { data: { integrationAuth } } = await apiRequest.post("/api/v1/integration-auth/oauth-token", {
        workspaceId,
        code,
        integration,
        url
      });

      return integrationAuth;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceAuthorization(res.workspace));
    }
  });
};

export const useSaveIntegrationAccessToken = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      workspaceId,
      integration,
      refreshToken,
      accessId,
      accessToken,
      url,
      namespace
    }: {
      workspaceId: string | null;
      integration: string | undefined;
      refreshToken?: string;
      accessId?: string;
      accessToken?: string;
      url?: string;
      namespace?: string;
    }) => {
      const { data: { integrationAuth } } = await apiRequest.post("/api/v1/integration-auth/access-token", {
        workspaceId,
        integration,
        refreshToken,
        accessId,
        accessToken,
        url,
        namespace
      });

      return integrationAuth;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceAuthorization(res.workspace));
    }
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

