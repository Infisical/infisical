import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { CaStatus } from "../ca/enums";
import { TCertificateAuthority } from "../ca/types";
import { TCertificate } from "../certificates/types";
import { TGroupMembership } from "../groups/types";
import { identitiesKeys } from "../identities/queries";
import { IdentityMembership } from "../identities/types";
import { IntegrationAuth } from "../integrationAuth/types";
import { TIntegration } from "../integrations/types";
import { EncryptedSecret } from "../secrets/types";
import { userKeys } from "../users/queries";
import { TWorkspaceUser } from "../users/types";
import {
  CreateEnvironmentDTO,
  CreateWorkspaceDTO,
  DeleteEnvironmentDTO,
  DeleteWorkspaceDTO,
  NameWorkspaceSecretsDTO,
  RenameWorkspaceDTO,
  TGetUpgradeProjectStatusDTO,
  ToggleAutoCapitalizationDTO,
  TUpdateWorkspaceIdentityRoleDTO,
  TUpdateWorkspaceUserRoleDTO,
  UpdateAuditLogsRetentionDTO,
  UpdateEnvironmentDTO,
  UpdatePitVersionLimitDTO,
  Workspace
} from "./types";

export const workspaceKeys = {
  getWorkspaceById: (workspaceId: string) => [{ workspaceId }, "workspace"] as const,
  getWorkspaceSecrets: (workspaceId: string) => [{ workspaceId }, "workspace-secrets"] as const,
  getWorkspaceIndexStatus: (workspaceId: string) =>
    [{ workspaceId }, "workspace-index-status"] as const,
  getProjectUpgradeStatus: (workspaceId: string) => [{ workspaceId }, "workspace-upgrade-status"],
  getWorkspaceMemberships: (orgId: string) => [{ orgId }, "workspace-memberships"],
  getWorkspaceAuthorization: (workspaceId: string) => [{ workspaceId }, "workspace-authorizations"],
  getWorkspaceIntegrations: (workspaceId: string) => [{ workspaceId }, "workspace-integrations"],
  getAllUserWorkspace: ["workspaces"] as const,
  getWorkspaceAuditLogs: (workspaceId: string) =>
    [{ workspaceId }, "workspace-audit-logs"] as const,
  getWorkspaceUsers: (workspaceId: string) => [{ workspaceId }, "workspace-users"] as const,
  getWorkspaceIdentityMemberships: (workspaceId: string) =>
    [{ workspaceId }, "workspace-identity-memberships"] as const,
  getWorkspaceGroupMemberships: (workspaceId: string) =>
    [{ workspaceId }, "workspace-groups"] as const,
  getWorkspaceCas: ({ projectSlug }: { projectSlug: string }) =>
    [{ projectSlug }, "workspace-cas"] as const,
  specificWorkspaceCas: ({ projectSlug, status }: { projectSlug: string; status?: CaStatus }) =>
    [...workspaceKeys.getWorkspaceCas({ projectSlug }), { status }] as const,
  allWorkspaceCertificates: () => ["workspace-certificates"] as const,
  forWorkspaceCertificates: (slug: string) =>
    [...workspaceKeys.allWorkspaceCertificates(), slug] as const,
  specificWorkspaceCertificates: ({
    slug,
    offset,
    limit
  }: {
    slug: string;
    offset: number;
    limit: number;
  }) => [...workspaceKeys.forWorkspaceCertificates(slug), { offset, limit }] as const
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

const fetchProjectUpgradeStatus = async (projectId: string) => {
  const { data } = await apiRequest.get<{ status: string }>(
    `/api/v2/workspace/${projectId}/upgrade/status`
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

export const useUpgradeProject = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, { projectId: string; privateKey: string }>({
    mutationFn: ({ projectId, privateKey }) => {
      return apiRequest.post(`/api/v2/workspace/${projectId}/upgrade`, {
        userPrivateKey: privateKey
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useGetUpgradeProjectStatus = ({
  projectId,
  onSuccess,
  enabled,
  refetchInterval
}: TGetUpgradeProjectStatusDTO) => {
  return useQuery({
    queryKey: workspaceKeys.getProjectUpgradeStatus(projectId),
    queryFn: () => fetchProjectUpgradeStatus(projectId),
    enabled,
    onSuccess,
    refetchInterval
  });
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
    enabled: Boolean(workspaceId)
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
    enabled: Boolean(workspaceId),
    refetchInterval: 4000
  });

export const createWorkspace = ({
  projectName
}: CreateWorkspaceDTO): Promise<{ data: { project: Workspace } }> => {
  return apiRequest.post("/api/v2/workspace", { projectName });
};

export const useCreateWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation<{ data: { project: Workspace } }, {}, CreateWorkspaceDTO>({
    mutationFn: async ({ projectName }) =>
      createWorkspace({
        projectName
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
      apiRequest.post(`/api/v1/workspace/${workspaceID}/auto-capitalization`, {
        autoCapitalization: state
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useUpdateWorkspaceVersionLimit = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, UpdatePitVersionLimitDTO>({
    mutationFn: ({ projectSlug, pitVersionLimit }) => {
      return apiRequest.put(`/api/v1/workspace/${projectSlug}/version-limit`, {
        pitVersionLimit
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(workspaceKeys.getAllUserWorkspace);
    }
  });
};

export const useUpdateWorkspaceAuditLogsRetention = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, UpdateAuditLogsRetentionDTO>({
    mutationFn: ({ projectSlug, auditLogsRetentionDays }) => {
      return apiRequest.put(`/api/v1/workspace/${projectSlug}/audit-logs-retention`, {
        auditLogsRetentionDays
      });
    },
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
    mutationFn: ({ workspaceId, name, slug }) => {
      return apiRequest.post(`/api/v1/workspace/${workspaceId}/environments`, {
        name,
        slug
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
    mutationFn: ({ workspaceId, id, name, slug, position }) => {
      return apiRequest.patch(`/api/v1/workspace/${workspaceId}/environments/${id}`, {
        name,
        slug,
        position
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
    mutationFn: ({ id, workspaceId }) => {
      return apiRequest.delete(`/api/v1/workspace/${workspaceId}/environments/${id}`);
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

export const useDeleteUserFromWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      usernames,
      workspaceId
    }: {
      workspaceId: string;
      usernames: string[];
      orgId: string;
    }) => {
      const {
        data: { deletedMembership }
      } = await apiRequest.delete(`/api/v2/workspace/${workspaceId}/memberships`, {
        data: { usernames }
      });
      return deletedMembership;
    },
    onSuccess: (_, { orgId, workspaceId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceUsers(workspaceId));
      queryClient.invalidateQueries(userKeys.allOrgMembershipProjectMemberships(orgId));
    }
  });
};

export const useUpdateUserWorkspaceRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ membershipId, roles, workspaceId }: TUpdateWorkspaceUserRoleDTO) => {
      const {
        data: { membership }
      } = await apiRequest.patch<{ membership: { projectId: string } }>(
        `/api/v1/workspace/${workspaceId}/memberships/${membershipId}`,
        {
          roles
        }
      );
      return membership;
    },
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceUsers(workspaceId));
    }
  });
};

export const useAddIdentityToWorkspace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      identityId,
      workspaceId,
      role
    }: {
      identityId: string;
      workspaceId: string;
      role?: string;
    }) => {
      const {
        data: { identityMembership }
      } = await apiRequest.post(
        `/api/v2/workspace/${workspaceId}/identity-memberships/${identityId}`,
        {
          role
        }
      );

      return identityMembership;
    },
    onSuccess: (_, { identityId, workspaceId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceIdentityMemberships(workspaceId));
      queryClient.invalidateQueries(identitiesKeys.getIdentityProjectMemberships(identityId));
    }
  });
};

export const useUpdateIdentityWorkspaceRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ identityId, workspaceId, roles }: TUpdateWorkspaceIdentityRoleDTO) => {
      const {
        data: { identityMembership }
      } = await apiRequest.patch(
        `/api/v2/workspace/${workspaceId}/identity-memberships/${identityId}`,
        {
          roles
        }
      );

      return identityMembership;
    },
    onSuccess: (_, { identityId, workspaceId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceIdentityMemberships(workspaceId));
      queryClient.invalidateQueries(identitiesKeys.getIdentityProjectMemberships(identityId));
    }
  });
};

export const useDeleteIdentityFromWorkspace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      identityId,
      workspaceId
    }: {
      identityId: string;
      workspaceId: string;
    }) => {
      const {
        data: { identityMembership }
      } = await apiRequest.delete(
        `/api/v2/workspace/${workspaceId}/identity-memberships/${identityId}`
      );
      return identityMembership;
    },
    onSuccess: (_, { identityId, workspaceId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceIdentityMemberships(workspaceId));
      queryClient.invalidateQueries(identitiesKeys.getIdentityProjectMemberships(identityId));
    }
  });
};

export const useGetWorkspaceIdentityMemberships = (workspaceId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceIdentityMemberships(workspaceId),
    queryFn: async () => {
      const {
        data: { identityMemberships }
      } = await apiRequest.get<{ identityMemberships: IdentityMembership[] }>(
        `/api/v2/workspace/${workspaceId}/identity-memberships`
      );
      return identityMemberships;
    },
    enabled: true
  });
};

export const useListWorkspaceGroups = (projectSlug: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceGroupMemberships(projectSlug),
    queryFn: async () => {
      const {
        data: { groupMemberships }
      } = await apiRequest.get<{ groupMemberships: TGroupMembership[] }>(
        `/api/v2/workspace/${projectSlug}/groups`
      );
      return groupMemberships;
    },
    enabled: true
  });
};

export const useListWorkspaceCas = ({
  projectSlug,
  status
}: {
  projectSlug: string;
  status?: CaStatus;
}) => {
  return useQuery({
    queryKey: workspaceKeys.specificWorkspaceCas({
      projectSlug,
      status
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        ...(status && { status })
      });

      const {
        data: { cas }
      } = await apiRequest.get<{ cas: TCertificateAuthority[] }>(
        `/api/v2/workspace/${projectSlug}/cas`,
        {
          params
        }
      );
      return cas;
    },
    enabled: Boolean(projectSlug)
  });
};

export const useListWorkspaceCertificates = ({
  projectSlug,
  offset,
  limit
}: {
  projectSlug: string;
  offset: number;
  limit: number;
}) => {
  return useQuery({
    queryKey: workspaceKeys.specificWorkspaceCertificates({
      slug: projectSlug,
      offset,
      limit
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit)
      });

      const {
        data: { certificates, totalCount }
      } = await apiRequest.get<{ certificates: TCertificate[]; totalCount: number }>(
        `/api/v2/workspace/${projectSlug}/certificates`,
        {
          params
        }
      );

      return { certificates, totalCount };
    },
    enabled: Boolean(projectSlug)
  });
};
