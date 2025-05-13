import { TListProjectIdentitiesDTO, TSearchProjectsDTO } from "@app/hooks/api/workspace/types";

import type { CaStatus } from "../ca";
import { WorkflowIntegrationPlatform } from "../workflowIntegrations/types";

export const workspaceKeys = {
  getWorkspaceById: (workspaceId: string) => ["workspaces", { workspaceId }] as const,
  getWorkspaceSecrets: (workspaceId: string) => [{ workspaceId }, "workspace-secrets"] as const,
  getWorkspaceIndexStatus: (workspaceId: string) =>
    [{ workspaceId }, "workspace-index-status"] as const,
  getProjectUpgradeStatus: (workspaceId: string) => [{ workspaceId }, "workspace-upgrade-status"],
  getWorkspaceMemberships: (orgId: string) => [{ orgId }, "workspace-memberships"],
  getWorkspaceAuthorization: (workspaceId: string) => [{ workspaceId }, "workspace-authorizations"],
  getWorkspaceIntegrations: (workspaceId: string) => [{ workspaceId }, "workspace-integrations"],
  getAllUserWorkspace: (type?: string) =>
    type ? ["workspaces", { type }] : (["workspaces"] as const),
  getWorkspaceAuditLogs: (workspaceId: string) =>
    [{ workspaceId }, "workspace-audit-logs"] as const,
  getWorkspaceUsers: (
    workspaceId: string,
    includeGroupMembers: boolean = false,
    roles: string[] = []
  ) => [{ workspaceId, includeGroupMembers, roles }, "workspace-users"] as const,
  getWorkspaceUserDetails: (workspaceId: string, membershipId: string) =>
    [{ workspaceId, membershipId }, "workspace-user-details"] as const,
  getWorkspaceIdentityMemberships: (workspaceId: string) =>
    [{ workspaceId }, "workspace-identity-memberships"] as const,
  getWorkspaceIdentityMembershipDetails: (workspaceId: string, identityId: string) =>
    [{ workspaceId, identityId }, "workspace-identity-membership-details"] as const,
  // allows invalidation using above key without knowing params
  getWorkspaceIdentityMembershipsWithParams: ({
    workspaceId,
    ...params
  }: TListProjectIdentitiesDTO) =>
    [...workspaceKeys.getWorkspaceIdentityMemberships(workspaceId), params] as const,
  searchWorkspace: (dto: TSearchProjectsDTO) => ["search-projects", dto] as const,
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
  }) => [...workspaceKeys.forWorkspaceCertificates(slug), { offset, limit }] as const,
  getWorkspacePkiAlerts: (workspaceId: string) =>
    [{ workspaceId }, "workspace-pki-alerts"] as const,
  getWorkspacePkiSubscribers: (projectId: string) =>
    [{ projectId }, "workspace-pki-subscribers"] as const,
  getWorkspacePkiCollections: (workspaceId: string) =>
    [{ workspaceId }, "workspace-pki-collections"] as const,
  getWorkspaceCertificateTemplates: (workspaceId: string) =>
    [{ workspaceId }, "workspace-certificate-templates"] as const,
  getWorkspaceWorkflowIntegrationConfig: (
    workspaceId: string,
    integration: WorkflowIntegrationPlatform
  ) => [{ workspaceId, integration }, "workspace-workflow-integration-config"] as const,
  getWorkspaceSshCas: (projectId: string) => [{ projectId }, "workspace-ssh-cas"] as const,
  allWorkspaceSshCertificates: (projectId: string) =>
    [{ projectId }, "workspace-ssh-certificates"] as const,
  getWorkspaceSshHosts: (projectId: string) => [{ projectId }, "workspace-ssh-hosts"] as const,
  getWorkspaceSshHostGroups: (projectId: string) =>
    [{ projectId }, "workspace-ssh-host-groups"] as const,
  specificWorkspaceSshCertificates: ({
    offset,
    limit,
    projectId
  }: {
    offset: number;
    limit: number;
    projectId: string;
  }) => [...workspaceKeys.allWorkspaceSshCertificates(projectId), { offset, limit }] as const,
  getWorkspaceSshCertificateTemplates: (projectId: string) =>
    [{ projectId }, "workspace-ssh-certificate-templates"] as const,
  getProjectSshConfig: (projectId: string) => [{ projectId }, "project-ssh-config"] as const
};
