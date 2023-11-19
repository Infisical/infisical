import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { IntegrationAuth } from "../integrationAuth/types";
import { TIntegration } from "../integrations/types";
import { EncryptedSecret } from "../secrets/types";
import { ServiceTokenDataV3 } from "../serviceTokens/types";
import { TWorkspaceUser } from "../users/types";
import {
  CreateEnvironmentDTO,
  CreateWorkspaceDTO,
  DeleteEnvironmentDTO,
  DeleteWorkspaceDTO,
  NameWorkspaceSecretsDTO,
  RenameWorkspaceDTO,
  ReorderEnvironmentsDTO,
  ToggleAutoCapitalizationDTO,
  UpdateEnvironmentDTO,
  Workspace
} from "./types";

export const workspaceKeys = {
  getWorkspaceById: (workspaceId: string) => [{ workspaceId }, "workspace"] as const,
  getWorkspaceSecrets: (workspaceId: string) => [{ workspaceId }, "workspace-secrets"] as const,
  getWorkspaceIndexStatus: (workspaceId: string) =>
    [{ workspaceId }, "workspace-index-status"] as const,
  getWorkspaceMemberships: (orgId: string) => [{ orgId }, "workspace-memberships"],
  getWorkspaceAuthorization: (workspaceId: string) => [{ workspaceId }, "workspace-authorizations"],
  getWorkspaceIntegrations: (workspaceId: string) => [{ workspaceId }, "workspace-integrations"],
  getAllUserWorkspace: ["workspaces"] as const,
  getWorkspaceAuditLogs: (workspaceId: string) => [{ workspaceId }] as const,
  getWorkspaceUsers: (workspaceId: string) => [{ workspaceId }] as const,
  getWorkspaceServiceTokenDataV3: (workspaceId: string) =>
    [{ workspaceId }, "workspace-service-token-data-v3"] as const
};

const fetchWorkspaceById = async (workspaceId: string) => {
  const { data } = await apiRequest.get<{ workspace: Workspace }>(
    `/api/v1/workspace/${workspaceId}`
  );

  return data.workspace;
};

const fetchWorkspaceIndexStatus = async (workspaceId: string) => {
  const { data } = await apiRequest.get<boolean>(
    `/api/v3/workspaces/${workspaceId}/secrets/blind-index-status`
  );

  return data;
};

export const fetchWorkspaceSecrets = async (workspaceId: string) => {
  const {
    data: { secrets }
  } = await apiRequest.get<{ secrets: EncryptedSecret[] }>(
    `/api/v3/workspaces/${workspaceId}/secrets`
  );

  return secrets;
};

const fetchUserWorkspaces = async () => {
  const { data } = await apiRequest.get<{ workspaces: Workspace[] }>("/api/v1/workspace");
  return data.workspaces;
};

export const useGetWorkspaceIndexStatus = (workspaceId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceIndexStatus(workspaceId),
    queryFn: () => fetchWorkspaceIndexStatus(workspaceId),
    enabled: true
  });
};

export const useGetWorkspaceSecrets = (workspaceId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceSecrets(workspaceId),
    queryFn: () => fetchWorkspaceSecrets(workspaceId),
    enabled: true
  });
};

export const useGetWorkspaceById = (workspaceId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceById(workspaceId),
    queryFn: () => fetchWorkspaceById(workspaceId),
    enabled: true
  });
};

export const useGetUserWorkspaces = () =>
  useQuery(workspaceKeys.getAllUserWorkspace, fetchUserWorkspaces);

const fetchUserWorkspaceMemberships = async (orgId: string) => {
  const { data } = await apiRequest.get<Record<string, Workspace[]>>(
    `/api/v1/organization/${orgId}/workspace-memberships`
  );
  return data;
};

// to get all userids in an org with the workspace they are part of
export const useGetUserWorkspaceMemberships = (orgId: string) =>
  useQuery({
    queryKey: workspaceKeys.getWorkspaceMemberships(orgId),
    queryFn: () => fetchUserWorkspaceMemberships(orgId),
    enabled: Boolean(orgId)
  });

export const useNameWorkspaceSecrets = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, NameWorkspaceSecretsDTO>({
    mutationFn: async ({ workspaceId, secretsToUpdate }) =>
      apiRequest.post(`/api/v3/workspaces/${workspaceId}/secrets/names`, {
        secretsToUpdate
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceIndexStatus(variables.workspaceId));
    }
  });
};

const fetchWorkspaceAuthorization = async (workspaceId: string) => {
  const { data } = await apiRequest.get<{ authorizations: IntegrationAuth[] }>(
    `/api/v1/workspace/${workspaceId}/authorizations`
  );
  return data.authorizations;
};

export const useGetWorkspaceAuthorizations = <TData = IntegrationAuth[],>(
  workspaceId: string,
  select?: (data: IntegrationAuth[]) => TData
) =>
  useQuery({
    queryKey: workspaceKeys.getWorkspaceAuthorization(workspaceId),
    queryFn: () => fetchWorkspaceAuthorization(workspaceId),
    enabled: Boolean(workspaceId),
    select
  });

const fetchWorkspaceIntegrations = async (workspaceId: string) => {
  const { data } = await apiRequest.get<{ integrations: TIntegration[] }>(
    `/api/v1/workspace/${workspaceId}/integrations`
  );
  return data.integrations;
};

export const useGetWorkspaceIntegrations = (workspaceId: string) =>
  useQuery({
    queryKey: workspaceKeys.getWorkspaceIntegrations(workspaceId),
    queryFn: () => fetchWorkspaceIntegrations(workspaceId),
    enabled: Boolean(workspaceId)
  });

export const createWorkspace = ({
  organizationId,
  workspaceName
}: CreateWorkspaceDTO): Promise<{ data: { workspace: Workspace } }> => {
  return apiRequest.post("/api/v1/workspace", { workspaceName, organizationId });
};

export const useCreateWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation<{ data: { workspace: Workspace } }, {}, CreateWorkspaceDTO>({
    mutationFn: async ({ organizationId, workspaceName }) =>
      createWorkspace({
        organizationId,
        workspaceName
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useRenameWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, RenameWorkspaceDTO>({
    mutationFn: ({ workspaceID, newWorkspaceName }) => {
      return apiRequest.post(`/api/v1/workspace/${workspaceID}/name`, { name: newWorkspaceName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useToggleAutoCapitalization = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, ToggleAutoCapitalizationDTO>({
    mutationFn: ({ workspaceID, state }) =>
      apiRequest.patch(`/api/v2/workspace/${workspaceID}/auto-capitalization`, {
        autoCapitalization: state
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useDeleteWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, DeleteWorkspaceDTO>({
    mutationFn: ({ workspaceID }) => {
      return apiRequest.delete(`/api/v1/workspace/${workspaceID}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useCreateWsEnvironment = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, CreateEnvironmentDTO>({
    mutationFn: ({ workspaceID, environmentName, environmentSlug }) => {
      return apiRequest.post(`/api/v2/workspace/${workspaceID}/environments`, {
        environmentName,
        environmentSlug
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useReorderWsEnvironment = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, ReorderEnvironmentsDTO>({
    mutationFn: ({
      workspaceID,
      environmentSlug,
      environmentName,
      otherEnvironmentSlug,
      otherEnvironmentName
    }) => {
      return apiRequest.patch(`/api/v2/workspace/${workspaceID}/environments`, {
        environmentSlug,
        environmentName,
        otherEnvironmentSlug,
        otherEnvironmentName
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useUpdateWsEnvironment = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, UpdateEnvironmentDTO>({
    mutationFn: ({ workspaceID, environmentName, environmentSlug, oldEnvironmentSlug }) => {
      return apiRequest.put(`/api/v2/workspace/${workspaceID}/environments`, {
        environmentName,
        environmentSlug,
        oldEnvironmentSlug
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useDeleteWsEnvironment = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, DeleteEnvironmentDTO>({
    mutationFn: ({ workspaceID, environmentSlug }) => {
      return apiRequest.delete(`/api/v2/workspace/${workspaceID}/environments`, {
        data: { environmentSlug }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useGetWorkspaceUsers = (workspaceId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceUsers(workspaceId),
    queryFn: async () => {
      const {
        data: { users }
      } = await apiRequest.get<{ users: TWorkspaceUser[] }>(
        `/api/v1/workspace/${workspaceId}/users`
      );
      return users;
    },
    enabled: true
  });
};

export const useAddUserToWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, workspaceId }: { email: string; workspaceId: string }) => {
      const {
        data: { invitee, latestKey }
      } = await apiRequest.post(`/api/v1/workspace/${workspaceId}/invite-signup`, { email });

      return {
        invitee,
        latestKey
      };
    },
    onSuccess: (_, dto) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceUsers(dto.workspaceId));
    }
  });
};

export const useDeleteUserFromWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (membershipId: string) => {
      const {
        data: { deletedMembership }
      } = await apiRequest.delete(`/api/v1/membership/${membershipId}`);
      return deletedMembership;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceUsers(res.workspace));
    }
  });
};

export const useUpdateUserWorkspaceRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ membershipId, role }: { membershipId: string; role: string }) => {
      const {
        data: { membership }
      } = await apiRequest.post(`/api/v1/membership/${membershipId}/change-role`, {
        role
      });
      return membership;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceUsers(res.workspace));
    }
  });
};

export const useGetWorkspaceServiceTokenDataV3 = (workspaceId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceServiceTokenDataV3(workspaceId),
    queryFn: async () => {
      const {
        data: { serviceTokenData }
      } = await apiRequest.get<{ serviceTokenData: ServiceTokenDataV3[] }>(
        `/api/v3/workspaces/${workspaceId}/service-token`
      );

      return serviceTokenData;
    },
    enabled: true
  });
};
