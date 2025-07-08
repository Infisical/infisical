import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { TReactQueryOptions } from "@app/types/reactQuery";

import { workspaceKeys } from "../workspace";
import {
  App,
  BitbucketEnvironment,
  BitbucketWorkspace,
  ChecklyGroup,
  CircleCIOrganization,
  Environment,
  HerokuPipelineCoupling,
  IntegrationAuth,
  KmsKey,
  NorthflankSecretGroup,
  Org,
  Project,
  Service,
  Team,
  TeamCityBuildConfig,
  TGetIntegrationAuthOctopusDeployScopeValuesDTO,
  TOctopusDeployVariableSetScopeValues,
  VercelEnvironment
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
  }) => [{ integrationAuthId, accountId }, "integrationAuthChecklyGroups"] as const,
  getIntegrationAuthGithubOrgs: (integrationAuthId: string) =>
    [{ integrationAuthId }, "integrationAuthGithubOrgs"] as const,
  getIntegrationAuthGithubEnvs: (integrationAuthId: string, repoName: string, repoOwner: string) =>
    [{ integrationAuthId, repoName, repoOwner }, "integrationAuthGithubOrgs"] as const,
  getIntegrationAuthAwsKmsKeys: ({
    integrationAuthId,
    region
  }: {
    integrationAuthId: string;
    region: string;
  }) => [{ integrationAuthId, region }, "integrationAuthAwsKmsKeyIds"] as const,
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
  getIntegrationAuthHerokuPipelines: ({ integrationAuthId }: { integrationAuthId: string }) =>
    [{ integrationAuthId }, "integrationAuthHerokuPipelines"] as const,
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
  getIntegrationAuthBitbucketWorkspaces: (integrationAuthId: string) =>
    [{ integrationAuthId }, "integrationAuthBitbucketWorkspaces"] as const,
  getIntegrationAuthBitbucketEnvironments: (
    integrationAuthId: string,
    workspaceSlug: string,
    repoSlug: string
  ) =>
    [
      { integrationAuthId },
      workspaceSlug,
      repoSlug,
      "integrationAuthBitbucketEnvironments"
    ] as const,
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
  getIntegrationAuthOctopusDeploySpaces: (integrationAuthId: string) =>
    [{ integrationAuthId }, "getIntegrationAuthOctopusDeploySpaces"] as const,
  getIntegrationAuthOctopusDeployScopeValues: ({
    integrationAuthId,
    ...params
  }: TGetIntegrationAuthOctopusDeployScopeValuesDTO) =>
    [{ integrationAuthId }, "getIntegrationAuthOctopusDeployScopeValues", params] as const,
  getIntegrationAuthCircleCIOrganizations: (integrationAuthId: string) =>
    [{ integrationAuthId }, "getIntegrationAuthCircleCIOrganizations"] as const,
  getIntegrationAuthVercelCustomEnv: (integrationAuthId: string, teamId: string) =>
    [{ integrationAuthId, teamId }, "integrationAuthVercelCustomEnv"] as const
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
  azureDevOpsOrgName,
  workspaceSlug
}: {
  integrationAuthId: string;
  teamId?: string;
  azureDevOpsOrgName?: string;
  workspaceSlug?: string;
}) => {
  const params: Record<string, string> = {};
  if (teamId) {
    params.teamId = teamId;
  }
  if (azureDevOpsOrgName) {
    params.azureDevOpsOrgName = azureDevOpsOrgName;
  }

  if (workspaceSlug) {
    params.workspaceSlug = workspaceSlug;
  }

  const searchParams = new URLSearchParams(params);
  const { data } = await apiRequest.get<{ apps: App[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/apps`,
    { params: searchParams }
  );

  return data.apps.sort((a, b) => a.name.localeCompare(b.name));
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

const fetchIntegrationAuthGithubOrgs = async (integrationAuthId: string) => {
  const {
    data: { orgs }
  } = await apiRequest.get<{ orgs: Org[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/github/orgs`
  );

  return orgs;
};

const fetchIntegrationAuthGithubEnvs = async (
  integrationAuthId: string,
  repoName: string,
  repoOwner: string
) => {
  if (!repoName || !repoOwner) return [];

  const {
    data: { envs }
  } = await apiRequest.get<{ envs: Array<{ name: string; envId: string }> }>(
    `/api/v1/integration-auth/${integrationAuthId}/github/envs?repoName=${repoName}&repoOwner=${repoOwner}`
  );

  return envs;
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

const fetchIntegrationAuthVercelCustomEnvironments = async ({
  integrationAuthId,
  teamId
}: {
  integrationAuthId: string;
  teamId: string;
}) => {
  const {
    data: { environments }
  } = await apiRequest.get<{
    environments: {
      appId: string;
      customEnvironments: VercelEnvironment[];
    }[];
  }>(`/api/v1/integration-auth/${integrationAuthId}/vercel/custom-environments`, {
    params: {
      teamId
    }
  });

  return environments;
};

const fetchIntegrationAuthHerokuPipelines = async ({
  integrationAuthId
}: {
  integrationAuthId: string;
}) => {
  const {
    data: { pipelines }
  } = await apiRequest.get<{ pipelines: HerokuPipelineCoupling[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/heroku/pipelines`
  );

  return pipelines;
};

const fetchIntegrationAuthRailwayEnvironments = async ({
  integrationAuthId,
  appId
}: {
  integrationAuthId: string;
  appId: string;
}) => {
  if (appId === "none") return [];
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
  if (appId === "none") return [];
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

const fetchIntegrationAuthBitbucketWorkspaces = async (integrationAuthId: string) => {
  const {
    data: { workspaces }
  } = await apiRequest.get<{ workspaces: BitbucketWorkspace[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/bitbucket/workspaces`
  );
  return workspaces;
};

const fetchIntegrationAuthBitbucketEnvironments = async (
  integrationAuthId: string,
  workspaceSlug: string,
  repoSlug: string
) => {
  const {
    data: { environments }
  } = await apiRequest.get<{ environments: BitbucketEnvironment[] }>(
    `/api/v1/integration-auth/${integrationAuthId}/bitbucket/environments`,
    {
      params: {
        workspaceSlug,
        repoSlug
      }
    }
  );
  return environments;
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

const fetchIntegrationAuthOctopusDeploySpaces = async (integrationAuthId: string) => {
  const {
    data: { spaces }
  } = await apiRequest.get<{
    spaces: { Name: string; Slug: string; Id: string; IsDefault: boolean }[];
  }>(`/api/v1/integration-auth/${integrationAuthId}/octopus-deploy/spaces`);
  return spaces;
};

const fetchIntegrationAuthOctopusDeployScopeValues = async ({
  integrationAuthId,
  scope,
  spaceId,
  resourceId
}: TGetIntegrationAuthOctopusDeployScopeValuesDTO) => {
  const { data } = await apiRequest.get<TOctopusDeployVariableSetScopeValues>(
    `/api/v1/integration-auth/${integrationAuthId}/octopus-deploy/scope-values`,
    { params: { scope, spaceId, resourceId } }
  );
  return data;
};

export const useGetIntegrationAuthById = (integrationAuthId: string) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthById(integrationAuthId),
    queryFn: () => fetchIntegrationAuthById(integrationAuthId),
    enabled: true
  });
};

export const useGetIntegrationAuthApps = (
  {
    integrationAuthId,
    teamId,
    azureDevOpsOrgName,
    workspaceSlug
  }: {
    integrationAuthId: string;
    teamId?: string;
    azureDevOpsOrgName?: string;
    workspaceSlug?: string;
  },
  options?: TReactQueryOptions["options"]
) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthApps(integrationAuthId, teamId, workspaceSlug),
    queryFn: () =>
      fetchIntegrationAuthApps({
        integrationAuthId,
        teamId,
        azureDevOpsOrgName,
        workspaceSlug
      }),
    ...options
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
    queryFn: () =>
      fetchIntegrationAuthChecklyGroups({
        integrationAuthId,
        accountId
      }),
    enabled: true
  });
};

export const useGetIntegrationAuthGithubOrgs = (integrationAuthId: string) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthGithubOrgs(integrationAuthId),
    queryFn: () => fetchIntegrationAuthGithubOrgs(integrationAuthId),
    enabled: true
  });
};

export const useGetIntegrationAuthGithubEnvs = (
  integrationAuthId: string,
  repoName: string,
  repoOwner: string
) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthGithubEnvs(
      integrationAuthId,
      repoName,
      repoOwner
    ),
    queryFn: () => fetchIntegrationAuthGithubEnvs(integrationAuthId, repoName, repoOwner),
    enabled: true
  });
};

export const useGetIntegrationAuthQoveryOrgs = (integrationAuthId: string) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthQoveryOrgs(integrationAuthId),
    queryFn: () => fetchIntegrationAuthQoveryOrgs(integrationAuthId),
    enabled: true
  });
};

export const useGetIntegrationAuthAwsKmsKeys = ({
  integrationAuthId,
  region
}: {
  integrationAuthId: string;
  region: string;
}) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthAwsKmsKeys({
      integrationAuthId,
      region
    }),
    queryFn: async () => {
      if (!region) return [];

      const {
        data: { kmsKeys }
      } = await apiRequest.get<{ kmsKeys: KmsKey[] }>(
        `/api/v1/integration-auth/${integrationAuthId}/aws-secrets-manager/kms-keys`,
        {
          params: {
            region
          }
        }
      );

      return kmsKeys;
    },
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

export const useGetIntegrationAuthVercelCustomEnvironments = ({
  integrationAuthId,
  teamId
}: {
  integrationAuthId: string;
  teamId: string;
}) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthVercelCustomEnv(integrationAuthId, teamId),
    queryFn: () =>
      fetchIntegrationAuthVercelCustomEnvironments({
        integrationAuthId,
        teamId
      }),
    enabled: Boolean(teamId && integrationAuthId)
  });
};

export const useGetIntegrationAuthHerokuPipelines = ({
  integrationAuthId
}: {
  integrationAuthId: string;
}) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthHerokuPipelines({
      integrationAuthId
    }),
    queryFn: () =>
      fetchIntegrationAuthHerokuPipelines({
        integrationAuthId
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

export const useGetIntegrationAuthBitbucketWorkspaces = (integrationAuthId: string) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthBitbucketWorkspaces(integrationAuthId),
    queryFn: () => fetchIntegrationAuthBitbucketWorkspaces(integrationAuthId),
    enabled: true
  });
};

export const useGetIntegrationAuthOctopusDeploySpaces = (integrationAuthId: string) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthOctopusDeploySpaces(integrationAuthId),
    queryFn: () => fetchIntegrationAuthOctopusDeploySpaces(integrationAuthId)
  });
};

export const useGetIntegrationAuthOctopusDeployScopeValues = (
  params: TGetIntegrationAuthOctopusDeployScopeValuesDTO,
  options?: TReactQueryOptions["options"]
) =>
  useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthOctopusDeployScopeValues(params),
    queryFn: () => fetchIntegrationAuthOctopusDeployScopeValues(params),
    ...options
  });

export const useGetIntegrationAuthBitbucketEnvironments = (
  {
    integrationAuthId,
    workspaceSlug,
    repoSlug
  }: {
    integrationAuthId: string;
    workspaceSlug: string;
    repoSlug: string;
  },
  options?: TReactQueryOptions["options"]
) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthBitbucketEnvironments(
      integrationAuthId,
      workspaceSlug,
      repoSlug
    ),
    queryFn: () =>
      fetchIntegrationAuthBitbucketEnvironments(integrationAuthId, workspaceSlug, repoSlug),
    ...options
  });
};

const fetchIntegrationAuthCircleCIOrganizations = async (integrationAuthId: string) => {
  const {
    data: { organizations }
  } = await apiRequest.get<{
    organizations: CircleCIOrganization[];
  }>(`/api/v1/integration-auth/${integrationAuthId}/circleci/organizations`);
  return organizations;
};
export const useGetIntegrationAuthCircleCIOrganizations = (integrationAuthId: string) => {
  return useQuery({
    queryKey: integrationAuthKeys.getIntegrationAuthCircleCIOrganizations(integrationAuthId),
    queryFn: () => fetchIntegrationAuthCircleCIOrganizations(integrationAuthId)
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
    queryFn: () =>
      fetchIntegrationAuthTeamCityBuildConfigs({
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
      installationId,
      url
    }: {
      workspaceId: string;
      code: string;
      integration: string;
      installationId?: string;
      url?: string;
    }) => {
      const {
        data: { integrationAuth }
      } = await apiRequest.post("/api/v1/integration-auth/oauth-token", {
        workspaceId,
        code,
        integration,
        installationId,
        url
      });

      return integrationAuth;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({
        queryKey: { queryKey: workspaceKeys.getWorkspaceAuthorization(res.workspace) }
      });
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
      awsAssumeIamRoleArn,
      url,
      namespace
    }: {
      workspaceId: string | null;
      integration: string | undefined;
      refreshToken?: string;
      accessId?: string;
      accessToken?: string;
      awsAssumeIamRoleArn?: string;
      url?: string;
      namespace?: string;
    }) => {
      const {
        data: { integrationAuth }
      } = await apiRequest.post("/api/v1/integration-auth/access-token", {
        workspaceId,
        integration,
        refreshToken,
        accessId,
        accessToken,
        awsAssumeIamRoleArn,
        url,
        namespace
      });

      return integrationAuth;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceAuthorization(res.workspace)
      });
    }
  });
};

export const useDeleteIntegrationAuths = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, { integration: string; workspaceId: string }>({
    mutationFn: ({ integration, workspaceId }) =>
      apiRequest.delete(
        `/api/v1/integration-auth?${new URLSearchParams({
          integration,
          projectId: workspaceId
        })}`
      ),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceAuthorization(workspaceId)
      });
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceIntegrations(workspaceId)
      });
    }
  });
};

export const useDeleteIntegrationAuth = () => {
  // not used
  const queryClient = useQueryClient();

  return useMutation<object, object, { id: string; workspaceId: string }>({
    mutationFn: ({ id }) => apiRequest.delete(`/api/v1/integration-auth/${id}`),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceAuthorization(workspaceId)
      });
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceIntegrations(workspaceId)
      });
    }
  });
};
