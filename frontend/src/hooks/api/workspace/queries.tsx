import { useMutation, useQuery, useQueryClient, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { OrderByDirection } from "@app/hooks/api/generic/types";

import { CaStatus } from "../ca/enums";
import { TCertificateAuthority } from "../ca/types";
import { TCertificate } from "../certificates/types";
import { TCertificateTemplate } from "../certificateTemplates/types";
import { TGroupMembership } from "../groups/types";
import { identitiesKeys } from "../identities/queries";
import { IdentityMembership, TProjectIdentitiesList } from "../identities/types";
import { IntegrationAuth } from "../integrationAuth/types";
import { TIntegration } from "../integrations/types";
import { TPkiAlert } from "../pkiAlerts/types";
import { TPkiCollection } from "../pkiCollections/types";
import { TPkiSubscriber } from "../pkiSubscriber/types";
import { EncryptedSecret } from "../secrets/types";
import { TSshCertificate, TSshCertificateAuthority } from "../sshCa/types";
import { TSshCertificateTemplate } from "../sshCertificateTemplates/types";
import { TSshHost } from "../sshHost/types";
import { TSshHostGroup } from "../sshHostGroup/types";
import { userKeys } from "../users/query-keys";
import { TWorkspaceUser } from "../users/types";
import {
  ProjectWorkflowIntegrationConfig,
  WorkflowIntegrationPlatform
} from "../workflowIntegrations/types";
import { workspaceKeys } from "./query-keys";
import {
  CreateEnvironmentDTO,
  CreateWorkspaceDTO,
  DeleteEnvironmentDTO,
  DeleteWorkspaceDTO,
  NameWorkspaceSecretsDTO,
  ProjectIdentityOrderBy,
  ProjectType,
  TGetUpgradeProjectStatusDTO,
  TListProjectIdentitiesDTO,
  ToggleAutoCapitalizationDTO,
  ToggleDeleteProjectProtectionDTO,
  TProjectSshConfig,
  TSearchProjectsDTO,
  TUpdateWorkspaceIdentityRoleDTO,
  TUpdateWorkspaceUserRoleDTO,
  UpdateAuditLogsRetentionDTO,
  UpdateEnvironmentDTO,
  UpdatePitVersionLimitDTO,
  UpdateProjectDTO,
  Workspace
} from "./types";

export const fetchWorkspaceById = async (workspaceId: string) => {
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

  return useMutation<object, object, { projectId: string; privateKey: string }>({
    mutationFn: ({ projectId, privateKey }) => {
      return apiRequest.post(`/api/v2/workspace/${projectId}/upgrade`, {
        userPrivateKey: privateKey
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getAllUserWorkspace()
      });
    }
  });
};

export const useGetUpgradeProjectStatus = ({
  projectId,
  enabled,
  refetchInterval
}: TGetUpgradeProjectStatusDTO) => {
  return useQuery({
    queryKey: workspaceKeys.getProjectUpgradeStatus(projectId),
    queryFn: () => fetchProjectUpgradeStatus(projectId),
    enabled,
    refetchInterval
  });
};

const fetchUserWorkspaces = async (includeRoles?: boolean, type?: ProjectType | "all") => {
  const { data } = await apiRequest.get<{ workspaces: Workspace[] }>("/api/v1/workspace", {
    params: {
      includeRoles,
      type
    }
  });
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

export const useGetWorkspaceById = (
  workspaceId: string,
  dto?: { refetchInterval?: number | false }
) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceById(workspaceId),
    queryFn: () => fetchWorkspaceById(workspaceId),
    enabled: Boolean(workspaceId),
    refetchInterval: dto?.refetchInterval
  });
};

export const useGetUserWorkspaces = ({
  includeRoles,
  options = {}
}: {
  includeRoles?: boolean;
  options?: { enabled?: boolean };
} = {}) =>
  useQuery({
    queryKey: workspaceKeys.getAllUserWorkspace(),
    queryFn: () => fetchUserWorkspaces(includeRoles),
    ...options
  });

export const useSearchProjects = ({ options, ...dto }: TSearchProjectsDTO) =>
  useQuery({
    queryKey: workspaceKeys.searchWorkspace(dto),
    queryFn: async () => {
      const { data } = await apiRequest.post<{
        projects: (Workspace & { isMember: boolean })[];
        totalCount: number;
      }>("/api/v1/workspace/search", dto);

      return data;
    },
    ...options
  });

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

  return useMutation<object, object, NameWorkspaceSecretsDTO>({
    mutationFn: async ({ workspaceId, secretsToUpdate }) =>
      apiRequest.post(`/api/v3/workspaces/${workspaceId}/secrets/names`, {
        secretsToUpdate
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceIndexStatus(variables.workspaceId)
      });
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

export const fetchWorkspaceIntegrations = async (workspaceId: string) => {
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

export const createWorkspace = (
  dto: CreateWorkspaceDTO
): Promise<{ data: { project: Workspace } }> => {
  return apiRequest.post("/api/v2/workspace", dto);
};

export const useCreateWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation<{ data: { project: Workspace } }, object, CreateWorkspaceDTO>({
    mutationFn: async ({ projectName, projectDescription, kmsKeyId, template }) =>
      createWorkspace({
        projectName,
        projectDescription,
        kmsKeyId,
        template
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getAllUserWorkspace()
      });
    }
  });
};

export const useUpdateProject = () => {
  const queryClient = useQueryClient();

  return useMutation<Workspace, object, UpdateProjectDTO>({
    mutationFn: async ({
      projectID,
      newProjectName,
      newProjectDescription,
      newSlug,
      secretSharing,
      showSnapshotsLegacy,
      defaultProduct
    }) => {
      const { data } = await apiRequest.patch<{ workspace: Workspace }>(
        `/api/v1/workspace/${projectID}`,
        {
          name: newProjectName,
          description: newProjectDescription,
          slug: newSlug,
          defaultProduct,
          secretSharing,
          showSnapshotsLegacy
        }
      );
      return data.workspace;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.getAllUserWorkspace() });
    }
  });
};

export const useToggleAutoCapitalization = () => {
  const queryClient = useQueryClient();

  return useMutation<Workspace, object, ToggleAutoCapitalizationDTO>({
    mutationFn: async ({ workspaceID, state }) => {
      const { data } = await apiRequest.post<{ workspace: Workspace }>(
        `/api/v1/workspace/${workspaceID}/auto-capitalization`,
        {
          autoCapitalization: state
        }
      );
      return data.workspace;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.getAllUserWorkspace() });
    }
  });
};

export const useToggleDeleteProjectProtection = () => {
  const queryClient = useQueryClient();

  return useMutation<Workspace, object, ToggleDeleteProjectProtectionDTO>({
    mutationFn: async ({ workspaceID, state }) => {
      const { data } = await apiRequest.post<{ workspace: Workspace }>(
        `/api/v1/workspace/${workspaceID}/delete-protection`,
        {
          hasDeleteProtection: state
        }
      );
      return data.workspace;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.getAllUserWorkspace() });
    }
  });
};

export const useUpdateWorkspaceVersionLimit = () => {
  const queryClient = useQueryClient();

  return useMutation<Workspace, object, UpdatePitVersionLimitDTO>({
    mutationFn: async ({ projectSlug, pitVersionLimit }) => {
      const { data } = await apiRequest.put(`/api/v1/workspace/${projectSlug}/version-limit`, {
        pitVersionLimit
      });
      return data.workspace;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.getAllUserWorkspace() });
    }
  });
};

export const useUpdateWorkspaceAuditLogsRetention = () => {
  const queryClient = useQueryClient();

  return useMutation<Workspace, object, UpdateAuditLogsRetentionDTO>({
    mutationFn: async ({ projectSlug, auditLogsRetentionDays }) => {
      const { data } = await apiRequest.put(
        `/api/v1/workspace/${projectSlug}/audit-logs-retention`,
        {
          auditLogsRetentionDays
        }
      );
      return data.workspace;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.getAllUserWorkspace() });
    }
  });
};

export const useDeleteWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation<Workspace, object, DeleteWorkspaceDTO>({
    mutationFn: async ({ workspaceID }) => {
      const { data } = await apiRequest.delete(`/api/v1/workspace/${workspaceID}`);
      return data.workspace;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.getAllUserWorkspace() });
      queryClient.invalidateQueries({
        queryKey: ["org-admin-projects"]
      });
    }
  });
};

export const useCreateWsEnvironment = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, CreateEnvironmentDTO>({
    mutationFn: ({ workspaceId, name, slug }) => {
      return apiRequest.post(`/api/v1/workspace/${workspaceId}/environments`, {
        name,
        slug
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getAllUserWorkspace()
      });
    }
  });
};

export const useUpdateWsEnvironment = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, UpdateEnvironmentDTO>({
    mutationFn: ({ workspaceId, id, name, slug, position }) => {
      return apiRequest.patch(`/api/v1/workspace/${workspaceId}/environments/${id}`, {
        name,
        slug,
        position
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getAllUserWorkspace()
      });
    }
  });
};

export const useDeleteWsEnvironment = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, DeleteEnvironmentDTO>({
    mutationFn: ({ id, workspaceId }) => {
      return apiRequest.delete(`/api/v1/workspace/${workspaceId}/environments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getAllUserWorkspace()
      });
    }
  });
};

export const useGetWorkspaceUsers = (
  workspaceId: string,
  includeGroupMembers?: boolean,
  roles?: string[]
) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceUsers(workspaceId, includeGroupMembers, roles),
    queryFn: async () => {
      const {
        data: { users }
      } = await apiRequest.get<{ users: TWorkspaceUser[] }>(
        `/api/v1/workspace/${workspaceId}/users`,
        {
          params: {
            includeGroupMembers,
            roles:
              roles && roles.length > 0
                ? roles.map((role) => encodeURIComponent(role)).join(",")
                : undefined
          }
        }
      );
      return users;
    },
    enabled: true
  });
};

export const useGetWorkspaceUserDetails = (workspaceId: string, membershipId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceUserDetails(workspaceId, membershipId),
    queryFn: async () => {
      const {
        data: { membership }
      } = await apiRequest.get<{ membership: TWorkspaceUser }>(
        `/api/v1/workspace/${workspaceId}/memberships/${membershipId}`
      );
      return membership;
    },
    enabled: Boolean(workspaceId) && Boolean(membershipId)
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
      queryClient.invalidateQueries({ queryKey: workspaceKeys.getWorkspaceUsers(workspaceId) });
      queryClient.invalidateQueries({
        queryKey: userKeys.allOrgMembershipProjectMemberships(orgId)
      });
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
    onSuccess: (_, { workspaceId, membershipId }) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.getWorkspaceUsers(workspaceId) });
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceUserDetails(workspaceId, membershipId)
      });
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
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceIdentityMemberships(workspaceId)
      });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityProjectMemberships(identityId)
      });
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
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceIdentityMemberships(workspaceId)
      });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityProjectMemberships(identityId)
      });
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceIdentityMembershipDetails(workspaceId, identityId)
      });
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
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspaceIdentityMemberships(workspaceId)
      });
      queryClient.invalidateQueries({
        queryKey: identitiesKeys.getIdentityProjectMemberships(identityId)
      });
    }
  });
};

export const useGetWorkspaceIdentityMemberships = (
  {
    workspaceId,
    offset = 0,
    limit = 100,
    orderBy = ProjectIdentityOrderBy.Name,
    orderDirection = OrderByDirection.ASC,
    search = ""
  }: TListProjectIdentitiesDTO,
  options?: Omit<
    UseQueryOptions<
      TProjectIdentitiesList,
      unknown,
      TProjectIdentitiesList,
      ReturnType<typeof workspaceKeys.getWorkspaceIdentityMembershipsWithParams>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceIdentityMembershipsWithParams({
      workspaceId,
      offset,
      limit,
      orderBy,
      orderDirection,
      search
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        orderBy: String(orderBy),
        orderDirection: String(orderDirection),
        search: String(search)
      });

      const { data } = await apiRequest.get<TProjectIdentitiesList>(
        `/api/v2/workspace/${workspaceId}/identity-memberships`,
        { params }
      );
      return data;
    },
    enabled: true,
    ...options
  });
};

export const useGetWorkspaceIdentityMembershipDetails = (projectId: string, identityId: string) => {
  return useQuery({
    enabled: Boolean(projectId && identityId),
    queryKey: workspaceKeys.getWorkspaceIdentityMembershipDetails(projectId, identityId),
    queryFn: async () => {
      const {
        data: { identityMembership }
      } = await apiRequest.get<{ identityMembership: IdentityMembership }>(
        `/api/v2/workspace/${projectId}/identity-memberships/${identityId}`
      );
      return identityMembership;
    }
  });
};

export const useGetWorkspaceGroupMembershipDetails = (projectId: string, groupId: string) => {
  return useQuery({
    enabled: Boolean(projectId && groupId),
    queryKey: workspaceKeys.getWorkspaceGroupMembershipDetails(projectId, groupId),
    queryFn: async () => {
      const {
        data: { groupMembership }
      } = await apiRequest.get<{ groupMembership: TGroupMembership }>(
        `/api/v2/workspace/${projectId}/groups/${groupId}`
      );
      return groupMembership;
    }
  });
};

export const useListWorkspaceGroups = (projectId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceGroupMemberships(projectId),
    queryFn: async () => {
      const {
        data: { groupMemberships }
      } = await apiRequest.get<{ groupMemberships: TGroupMembership[] }>(
        `/api/v2/workspace/${projectId}/groups`
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

export const useListWorkspacePkiAlerts = ({ workspaceId }: { workspaceId: string }) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspacePkiAlerts(workspaceId),
    queryFn: async () => {
      const {
        data: { alerts }
      } = await apiRequest.get<{ alerts: TPkiAlert[] }>(
        `/api/v2/workspace/${workspaceId}/pki-alerts`
      );

      return { alerts };
    },
    enabled: Boolean(workspaceId)
  });
};

export const useListWorkspacePkiCollections = ({ workspaceId }: { workspaceId: string }) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspacePkiCollections(workspaceId),
    queryFn: async () => {
      const {
        data: { collections }
      } = await apiRequest.get<{ collections: TPkiCollection[] }>(
        `/api/v2/workspace/${workspaceId}/pki-collections`
      );

      return { collections };
    },
    enabled: Boolean(workspaceId)
  });
};

export const useListWorkspaceCertificateTemplates = ({ workspaceId }: { workspaceId: string }) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceCertificateTemplates(workspaceId),
    queryFn: async () => {
      const {
        data: { certificateTemplates }
      } = await apiRequest.get<{ certificateTemplates: TCertificateTemplate[] }>(
        `/api/v2/workspace/${workspaceId}/certificate-templates`
      );

      return { certificateTemplates };
    },
    enabled: Boolean(workspaceId)
  });
};

export const useListWorkspaceSshCertificates = ({
  offset,
  limit,
  projectId
}: {
  offset: number;
  limit: number;
  projectId: string;
}) => {
  return useQuery({
    queryKey: workspaceKeys.specificWorkspaceSshCertificates({
      offset,
      limit,
      projectId
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit)
      });

      const { data } = await apiRequest.get<{
        certificates: TSshCertificate[];
        totalCount: number;
      }>(`/api/v2/workspace/${projectId}/ssh-certificates`, {
        params
      });
      return data;
    },
    enabled: Boolean(projectId)
  });
};

export const useListWorkspaceSshCas = (projectId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceSshCas(projectId),
    queryFn: async () => {
      const {
        data: { cas }
      } = await apiRequest.get<{ cas: Omit<TSshCertificateAuthority, "publicKey">[] }>(
        `/api/v2/workspace/${projectId}/ssh-cas`
      );
      return cas;
    },
    enabled: Boolean(projectId)
  });
};

export const useListWorkspaceSshHosts = (projectId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceSshHosts(projectId),
    queryFn: async () => {
      const {
        data: { hosts }
      } = await apiRequest.get<{ hosts: TSshHost[] }>(`/api/v2/workspace/${projectId}/ssh-hosts`);
      return hosts;
    },
    enabled: Boolean(projectId)
  });
};

export const useListWorkspacePkiSubscribers = (projectId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspacePkiSubscribers(projectId),
    queryFn: async () => {
      const {
        data: { subscribers }
      } = await apiRequest.get<{ subscribers: TPkiSubscriber[] }>(
        `/api/v2/workspace/${projectId}/pki-subscribers`
      );
      return subscribers;
    },
    enabled: Boolean(projectId)
  });
};

export const useListWorkspaceSshHostGroups = (projectId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceSshHostGroups(projectId),
    queryFn: async () => {
      const {
        data: { groups }
      } = await apiRequest.get<{ groups: (TSshHostGroup & { hostCount: number })[] }>(
        `/api/v2/workspace/${projectId}/ssh-host-groups`
      );
      return groups;
    },
    enabled: Boolean(projectId)
  });
};

export const useListWorkspaceSshCertificateTemplates = (projectId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceSshCertificateTemplates(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ certificateTemplates: TSshCertificateTemplate[] }>(
        `/api/v2/workspace/${projectId}/ssh-certificate-templates`
      );
      return data;
    },
    enabled: Boolean(projectId)
  });
};

export const useGetWorkspaceWorkflowIntegrationConfig = ({
  workspaceId,
  integration
}: {
  workspaceId: string;
  integration: WorkflowIntegrationPlatform;
}) => {
  return useQuery({
    queryKey: workspaceKeys.getWorkspaceWorkflowIntegrationConfig(workspaceId, integration),
    queryFn: async () => {
      const { data } = await apiRequest
        .get<ProjectWorkflowIntegrationConfig>(
          `/api/v1/workspace/${workspaceId}/workflow-integration-config/${integration}`
        )
        .catch((err) => {
          if (err.response.status === 404) {
            return { data: null };
          }

          throw err;
        });

      return data;
    },
    enabled: Boolean(workspaceId)
  });
};

export const useGetProjectSshConfig = (projectId: string) => {
  return useQuery({
    queryKey: workspaceKeys.getProjectSshConfig(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TProjectSshConfig>(
        `/api/v1/workspace/${projectId}/ssh-config`
      );

      return data;
    },
    enabled: Boolean(projectId)
  });
};
