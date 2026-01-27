import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { CaStatus } from "../ca/enums";
import { TCertificateAuthority } from "../ca/types";
import { TCertificate } from "../certificates/types";
import { TCertificateTemplate } from "../certificateTemplates/types";
import { TGroupMembership } from "../groups/types";
import { IntegrationAuth } from "../integrationAuth/types";
import { TIntegration } from "../integrations/types";
import { TPkiAlert } from "../pkiAlerts/types";
import { TPkiCollection } from "../pkiCollections/types";
import { TPkiSubscriber } from "../pkiSubscriber/types";
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
import { projectKeys } from "./query-keys";
import {
  CreateEnvironmentDTO,
  CreateWorkspaceDTO,
  DeleteEnvironmentDTO,
  DeleteWorkspaceDTO,
  Project,
  ProjectEnv,
  ProjectType,
  TGetUpgradeProjectStatusDTO,
  TProjectSshConfig,
  TSearchProjectsDTO,
  TUpdateWorkspaceUserRoleDTO,
  UpdateAuditLogsRetentionDTO,
  UpdateEnvironmentDTO,
  UpdateProjectDTO
} from "./types";

export const fetchProjectById = async (projectId: string) => {
  const { data } = await apiRequest.get<{ project: Project }>(`/api/v1/projects/${projectId}`);

  return data.project;
};

const fetchWorkspaceIndexStatus = async (projectId: string) => {
  const { data } = await apiRequest.get<boolean>(
    `/api/v3/projects/${projectId}/secrets/blind-index-status`
  );

  return data;
};

const fetchProjectUpgradeStatus = async (projectId: string) => {
  const { data } = await apiRequest.get<{ status: string }>(
    `/api/v1/projects/${projectId}/upgrade/status`
  );

  return data;
};

export const useUpgradeProject = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, { projectId: string; privateKey: string }>({
    mutationFn: ({ projectId, privateKey }) => {
      return apiRequest.post(`/api/v1/projects/${projectId}/upgrade`, {
        userPrivateKey: privateKey
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getAllUserProjects()
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
    queryKey: projectKeys.getProjectUpgradeStatus(projectId),
    queryFn: () => fetchProjectUpgradeStatus(projectId),
    enabled,
    refetchInterval
  });
};

const fetchUserWorkspaces = async (includeRoles?: boolean, type?: ProjectType | "all") => {
  const { data } = await apiRequest.get<{ projects: Project[] }>("/api/v1/projects", {
    params: {
      includeRoles,
      type
    }
  });
  return data.projects;
};

export const useGetWorkspaceIndexStatus = (projectId: string) => {
  return useQuery({
    queryKey: projectKeys.getProjectIndexStatus(projectId),
    queryFn: () => fetchWorkspaceIndexStatus(projectId),
    enabled: true
  });
};

export const useGetWorkspaceById = (
  projectId: string,
  dto?: { refetchInterval?: number | false }
) => {
  return useQuery({
    queryKey: projectKeys.getProjectById(projectId),
    queryFn: () => fetchProjectById(projectId),
    enabled: Boolean(projectId),
    refetchInterval: dto?.refetchInterval
  });
};

export const useGetUserProjects = ({
  includeRoles,
  options = {}
}: {
  includeRoles?: boolean;
  options?: { enabled?: boolean };
} = {}) =>
  useQuery({
    queryKey: projectKeys.getAllUserProjects(),
    queryFn: () => fetchUserWorkspaces(includeRoles),
    ...options
  });

export const useSearchProjects = ({ options, ...dto }: TSearchProjectsDTO) =>
  useQuery({
    queryKey: projectKeys.searchProject(dto),
    queryFn: async () => {
      const { data } = await apiRequest.post<{
        projects: (Project & { isMember: boolean })[];
        totalCount: number;
      }>("/api/v1/projects/search", dto);

      return data;
    },
    ...options
  });

const fetchUserWorkspaceMemberships = async (orgId: string) => {
  const { data } = await apiRequest.get<Record<string, Project[]>>(
    `/api/v1/organization/${orgId}/project-memberships`
  );

  return data;
};

// to get all userids in an org with the project they are part of
export const useGetUserWorkspaceMemberships = (orgId: string) =>
  useQuery({
    queryKey: projectKeys.getProjectMemberships(orgId),
    queryFn: () => fetchUserWorkspaceMemberships(orgId),
    enabled: Boolean(orgId)
  });

const fetchWorkspaceAuthorization = async (projectId: string) => {
  const { data } = await apiRequest.get<{ authorizations: IntegrationAuth[] }>(
    `/api/v1/projects/${projectId}/authorizations`
  );

  return data.authorizations;
};

export const useGetWorkspaceAuthorizations = <TData = IntegrationAuth[],>(
  projectId: string,
  select?: (data: IntegrationAuth[]) => TData
) =>
  useQuery({
    queryKey: projectKeys.getProjectAuthorization(projectId),
    queryFn: () => fetchWorkspaceAuthorization(projectId),
    enabled: Boolean(projectId),
    select
  });

export const fetchWorkspaceIntegrations = async (projectId: string) => {
  const { data } = await apiRequest.get<{ integrations: TIntegration[] }>(
    `/api/v1/projects/${projectId}/integrations`
  );
  return data.integrations;
};

export const useGetWorkspaceIntegrations = (
  projectId: string,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) =>
  useQuery({
    queryKey: projectKeys.getProjectIntegrations(projectId),
    queryFn: () => fetchWorkspaceIntegrations(projectId),
    enabled: Boolean(projectId) && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval ?? 4000
  });

export const createWorkspace = (
  dto: CreateWorkspaceDTO
): Promise<{ data: { project: Project } }> => {
  return apiRequest.post("/api/v1/projects", dto);
};

export const useCreateWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation<{ data: { project: Project } }, object, CreateWorkspaceDTO>({
    mutationFn: async ({ projectName, projectDescription, kmsKeyId, template, type }) =>
      createWorkspace({
        projectName,
        projectDescription,
        kmsKeyId,
        template,
        type
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getAllUserProjects()
      });
    }
  });
};

export const useUpdateProject = () => {
  const queryClient = useQueryClient();

  return useMutation<Project, object, UpdateProjectDTO>({
    mutationFn: async ({
      projectId: projectID,
      newProjectName,
      hasDeleteProtection,
      enforceEncryptedSecretManagerSecretMetadata,
      newProjectDescription,
      newSlug,
      secretSharing,
      showSnapshotsLegacy,
      secretDetectionIgnoreValues,
      autoCapitalization,
      pitVersionLimit
    }) => {
      const { data } = await apiRequest.patch<{ project: Project }>(
        `/api/v1/projects/${projectID}`,
        {
          name: newProjectName,
          description: newProjectDescription,
          slug: newSlug,
          secretSharing,
          showSnapshotsLegacy,
          secretDetectionIgnoreValues,
          autoCapitalization,
          pitVersionLimit,
          hasDeleteProtection,
          enforceEncryptedSecretManagerSecretMetadata
        }
      );
      return data.project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.getAllUserProjects() });
    }
  });
};

export const useUpdateWorkspaceAuditLogsRetention = () => {
  const queryClient = useQueryClient();

  return useMutation<Project, object, UpdateAuditLogsRetentionDTO>({
    mutationFn: async ({ projectSlug, auditLogsRetentionDays }) => {
      const { data } = await apiRequest.put(
        `/api/v1/projects/${projectSlug}/audit-logs-retention`,
        {
          auditLogsRetentionDays
        }
      );
      return data.project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.getAllUserProjects() });
    }
  });
};

export const useDeleteWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation<Project, object, DeleteWorkspaceDTO>({
    mutationFn: async ({ projectID }) => {
      const { data } = await apiRequest.delete(`/api/v1/projects/${projectID}`);
      return data.project;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.getAllUserProjects() });
      queryClient.invalidateQueries({
        queryKey: ["org-admin-projects"]
      });
    }
  });
};

export const useCreateWsEnvironment = () => {
  const queryClient = useQueryClient();

  return useMutation<ProjectEnv, ProjectEnv, CreateEnvironmentDTO>({
    mutationFn: async ({ projectId, name, slug }) => {
      const { data } = await apiRequest.post<{ environment: ProjectEnv }>(
        `/api/v1/projects/${projectId}/environments`,
        {
          name,
          slug
        }
      );
      return data.environment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getAllUserProjects()
      });
    }
  });
};

export const useUpdateWsEnvironment = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, UpdateEnvironmentDTO>({
    mutationFn: ({ projectId, id, name, slug, position }) => {
      return apiRequest.patch(`/api/v1/projects/${projectId}/environments/${id}`, {
        name,
        slug,
        position
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getAllUserProjects()
      });
    }
  });
};

export const useDeleteWsEnvironment = () => {
  const queryClient = useQueryClient();

  return useMutation<object, object, DeleteEnvironmentDTO>({
    mutationFn: ({ id, projectId }) => {
      return apiRequest.delete(`/api/v1/projects/${projectId}/environments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getAllUserProjects()
      });
    }
  });
};

export const useGetWorkspaceUsers = (
  projectId: string,
  includeGroupMembers?: boolean,
  roles?: string[]
) => {
  return useQuery({
    queryKey: projectKeys.getProjectUsers(projectId, includeGroupMembers, roles),
    queryFn: async () => {
      const {
        data: { users }
      } = await apiRequest.get<{ users: TWorkspaceUser[] }>(`/api/v1/projects/${projectId}/users`, {
        params: {
          includeGroupMembers,
          roles:
            roles && roles.length > 0
              ? roles.map((role) => encodeURIComponent(role)).join(",")
              : undefined
        }
      });
      return users;
    },
    enabled: true
  });
};

export const useGetWorkspaceUserDetails = (projectId: string, membershipId: string) => {
  return useQuery({
    queryKey: projectKeys.getProjectUserDetails(projectId, membershipId),
    queryFn: async () => {
      const {
        data: { membership }
      } = await apiRequest.get<{ membership: TWorkspaceUser }>(
        `/api/v1/projects/${projectId}/memberships/${membershipId}`
      );
      return membership;
    },
    enabled: Boolean(projectId) && Boolean(membershipId)
  });
};

export const useDeleteUserFromWorkspace = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      usernames,
      projectId
    }: {
      projectId: string;
      usernames: string[];
      orgId: string;
    }) => {
      const {
        data: { deletedMembership }
      } = await apiRequest.delete(`/api/v1/projects/${projectId}/memberships`, {
        data: { usernames }
      });
      return deletedMembership;
    },
    onSuccess: (_, { orgId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectUsers(projectId) });
      queryClient.invalidateQueries({
        queryKey: userKeys.allOrgMembershipProjectMemberships(orgId)
      });
    }
  });
};

export const useUpdateUserWorkspaceRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ membershipId, roles, projectId }: TUpdateWorkspaceUserRoleDTO) => {
      const {
        data: { membership }
      } = await apiRequest.patch<{ membership: { projectId: string } }>(
        `/api/v1/projects/${projectId}/memberships/${membershipId}`,
        {
          roles
        }
      );
      return membership;
    },
    onSuccess: (_, { projectId, membershipId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectUsers(projectId) });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectUserDetails(projectId, membershipId)
      });
    }
  });
};

export const useGetWorkspaceGroupMembershipDetails = (projectId: string, groupId: string) => {
  return useQuery({
    enabled: Boolean(projectId && groupId),
    queryKey: projectKeys.getProjectGroupMembershipDetails(projectId, groupId),
    queryFn: async () => {
      const {
        data: { groupMembership }
      } = await apiRequest.get<{ groupMembership: TGroupMembership }>(
        `/api/v1/projects/${projectId}/groups/${groupId}`
      );
      return groupMembership;
    }
  });
};

export const useListWorkspaceGroups = (projectId: string) => {
  return useQuery({
    queryKey: projectKeys.getProjectGroupMemberships(projectId),
    queryFn: async () => {
      const {
        data: { groupMemberships }
      } = await apiRequest.get<{ groupMemberships: TGroupMembership[] }>(
        `/api/v1/projects/${projectId}/groups`
      );
      return groupMemberships;
    },
    enabled: true
  });
};

export const useListWorkspaceCas = ({
  projectId,
  status
}: {
  projectId: string;
  status?: CaStatus;
}) => {
  return useQuery({
    queryKey: projectKeys.specificProjectCas({
      projectId,
      status
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        ...(status && { status })
      });

      const {
        data: { cas }
      } = await apiRequest.get<{ cas: TCertificateAuthority[] }>(
        `/api/v1/projects/${projectId}/cas`,
        {
          params
        }
      );
      return cas;
    },
    enabled: Boolean(projectId)
  });
};

export const useListWorkspaceCertificates = ({
  projectId,
  offset,
  limit,
  friendlyName,
  commonName,
  forPkiSync,
  search,
  status,
  profileIds,
  fromDate,
  toDate
}: {
  projectId: string;
  offset: number;
  limit: number;
  friendlyName?: string;
  commonName?: string;
  forPkiSync?: boolean;
  search?: string;
  status?: string | string[];
  profileIds?: string[];
  fromDate?: Date;
  toDate?: Date;
}) => {
  return useQuery({
    queryKey: projectKeys.specificProjectCertificates({
      projectId,
      offset,
      limit,
      friendlyName,
      commonName,
      forPkiSync,
      search,
      status,
      profileIds,
      fromDate,
      toDate
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit)
      });

      if (friendlyName) {
        params.append("friendlyName", friendlyName);
      }
      if (commonName) {
        params.append("commonName", commonName);
      }
      if (forPkiSync) {
        params.append("forPkiSync", "true");
      }
      if (search) {
        params.append("search", search);
      }
      if (status) {
        if (Array.isArray(status)) {
          status.forEach((statusValue) => {
            params.append("status", statusValue);
          });
        } else {
          params.append("status", status);
        }
      }
      if (fromDate) {
        params.append("fromDate", fromDate.toISOString());
      }
      if (toDate) {
        params.append("toDate", toDate.toISOString());
      }
      if (profileIds && profileIds.length > 0) {
        profileIds.forEach((id) => {
          params.append("profileIds", id);
        });
      }

      const {
        data: { certificates, totalCount }
      } = await apiRequest.get<{ certificates: TCertificate[]; totalCount: number }>(
        `/api/v1/projects/${projectId}/certificates`,
        {
          params
        }
      );

      return { certificates, totalCount };
    },
    enabled: Boolean(projectId),
    placeholderData: (previousData) => previousData
  });
};

export const useListWorkspacePkiAlerts = ({ projectId }: { projectId: string }) => {
  return useQuery({
    queryKey: projectKeys.getProjectPkiAlerts(projectId),
    queryFn: async () => {
      const {
        data: { alerts }
      } = await apiRequest.get<{ alerts: TPkiAlert[] }>(`/api/v1/projects/${projectId}/pki-alerts`);

      return { alerts };
    },
    enabled: Boolean(projectId)
  });
};

export const useListWorkspacePkiCollections = ({ projectId }: { projectId: string }) => {
  return useQuery({
    queryKey: projectKeys.getProjectPkiCollections(projectId),
    queryFn: async () => {
      const {
        data: { collections }
      } = await apiRequest.get<{ collections: TPkiCollection[] }>(
        `/api/v1/projects/${projectId}/pki-collections`
      );

      return { collections };
    },
    enabled: Boolean(projectId)
  });
};

export const useListWorkspaceCertificateTemplates = ({ projectId }: { projectId: string }) => {
  return useQuery({
    queryKey: projectKeys.getProjectCertificateTemplates(projectId),
    queryFn: async () => {
      const {
        data: { certificateTemplates }
      } = await apiRequest.get<{ certificateTemplates: TCertificateTemplate[] }>(
        `/api/v1/projects/${projectId}/certificate-templates`
      );

      return { certificateTemplates };
    },
    enabled: Boolean(projectId)
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
    queryKey: projectKeys.specificProjectSshCertificates({
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
      }>(`/api/v1/projects/${projectId}/ssh-certificates`, {
        params
      });
      return data;
    },
    enabled: Boolean(projectId)
  });
};

export const useListWorkspaceSshCas = (projectId: string) => {
  return useQuery({
    queryKey: projectKeys.getProjectSshCas(projectId),
    queryFn: async () => {
      const {
        data: { cas }
      } = await apiRequest.get<{ cas: Omit<TSshCertificateAuthority, "publicKey">[] }>(
        `/api/v1/projects/${projectId}/ssh-cas`
      );
      return cas;
    },
    enabled: Boolean(projectId)
  });
};

export const useListWorkspaceSshHosts = (projectId: string) => {
  return useQuery({
    queryKey: projectKeys.getProjectSshHosts(projectId),
    queryFn: async () => {
      const {
        data: { hosts }
      } = await apiRequest.get<{ hosts: TSshHost[] }>(`/api/v1/projects/${projectId}/ssh-hosts`);
      return hosts;
    },
    enabled: Boolean(projectId)
  });
};

export const useListWorkspacePkiSubscribers = (projectId: string) => {
  return useQuery({
    queryKey: projectKeys.getProjectPkiSubscribers(projectId),
    queryFn: async () => {
      const {
        data: { subscribers }
      } = await apiRequest.get<{ subscribers: TPkiSubscriber[] }>(
        `/api/v1/projects/${projectId}/pki-subscribers`
      );
      return subscribers;
    },
    enabled: Boolean(projectId)
  });
};

export const useListWorkspaceSshHostGroups = (projectId: string) => {
  return useQuery({
    queryKey: projectKeys.getProjectSshHostGroups(projectId),
    queryFn: async () => {
      const {
        data: { groups }
      } = await apiRequest.get<{ groups: (TSshHostGroup & { hostCount: number })[] }>(
        `/api/v1/projects/${projectId}/ssh-host-groups`
      );
      return groups;
    },
    enabled: Boolean(projectId)
  });
};

export const useListWorkspaceSshCertificateTemplates = (projectId: string) => {
  return useQuery({
    queryKey: projectKeys.getProjectSshCertificateTemplates(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ certificateTemplates: TSshCertificateTemplate[] }>(
        `/api/v1/projects/${projectId}/ssh-certificate-templates`
      );
      return data;
    },
    enabled: Boolean(projectId)
  });
};

export const useGetWorkspaceWorkflowIntegrationConfig = ({
  projectId,
  integration
}: {
  projectId: string;
  integration: WorkflowIntegrationPlatform;
}) => {
  return useQuery({
    queryKey: projectKeys.getProjectWorkflowIntegrationConfig(projectId, integration),
    queryFn: async () => {
      const { data } = await apiRequest
        .get<ProjectWorkflowIntegrationConfig>(
          `/api/v1/projects/${projectId}/workflow-integration-config/${integration}`
        )
        .catch((err) => {
          if (err.response.status === 404) {
            return { data: null };
          }

          throw err;
        });

      return data;
    },
    enabled: Boolean(projectId)
  });
};

export const useGetProjectSshConfig = (projectId: string) => {
  return useQuery({
    queryKey: projectKeys.getProjectSshConfig(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TProjectSshConfig>(
        `/api/v1/projects/${projectId}/ssh-config`
      );

      return data;
    },
    enabled: Boolean(projectId)
  });
};
