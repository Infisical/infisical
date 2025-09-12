import { TListProjectIdentitiesDTO, TSearchProjectsDTO } from "@app/hooks/api/workspace/types";

import type { CaStatus } from "../ca";
import { WorkflowIntegrationPlatform } from "../workflowIntegrations/types";

export const projectKeys = {
  getWorkspaceById: (projectId: string) => ["projects", { projectId }] as const,
  getWorkspaceSecrets: (projectId: string) => [{ projectId }, "project-secrets"] as const,
  getWorkspaceIndexStatus: (projectId: string) => [{ projectId }, "project-index-status"] as const,
  getProjectUpgradeStatus: (projectId: string) => [{ projectId }, "project-upgrade-status"],
  getWorkspaceMemberships: (orgId: string) => [{ orgId }, "project-memberships"],
  getWorkspaceAuthorization: (projectId: string) => [{ projectId }, "project-authorizations"],
  getWorkspaceIntegrations: (projectId: string) => [{ projectId }, "project-integrations"],
  getAllUserWorkspace: () => ["projects"] as const,
  getWorkspaceAuditLogs: (projectId: string) => [{ projectId }, "project-audit-logs"] as const,
  getWorkspaceUsers: (
    projectId: string,
    includeGroupMembers: boolean = false,
    roles: string[] = []
  ) => [{ projectId, includeGroupMembers, roles }, "project-users"] as const,
  getWorkspaceUserDetails: (projectId: string, membershipId: string) =>
    [{ projectId, membershipId }, "project-user-details"] as const,
  getWorkspaceIdentityMemberships: (projectId: string) =>
    [{ projectId }, "project-identity-memberships"] as const,
  getWorkspaceIdentityMembershipDetails: (projectId: string, identityId: string) =>
    [{ projectId, identityId }, "project-identity-membership-details"] as const,
  // allows invalidation using above key without knowing params
  getWorkspaceIdentityMembershipsWithParams: ({
    projectId,
    ...params
  }: TListProjectIdentitiesDTO) =>
    [...projectKeys.getWorkspaceIdentityMemberships(projectId), params] as const,
  searchWorkspace: (dto: TSearchProjectsDTO) => ["search-projects", dto] as const,
  getWorkspaceGroupMemberships: (projectId: string) => [{ projectId }, "project-groups"] as const,
  getWorkspaceGroupMembershipDetails: (projectId: string, groupId: string) =>
    [{ projectId, groupId }, "project-group-membership-details"] as const,
  getWorkspaceCas: ({ projectSlug }: { projectSlug: string }) =>
    [{ projectSlug }, "project-cas"] as const,
  specificWorkspaceCas: ({ projectSlug, status }: { projectSlug: string; status?: CaStatus }) =>
    [...projectKeys.getWorkspaceCas({ projectSlug }), { status }] as const,
  allWorkspaceCertificates: () => ["project-certificates"] as const,
  forWorkspaceCertificates: (slug: string) =>
    [...projectKeys.allWorkspaceCertificates(), slug] as const,
  specificWorkspaceCertificates: ({
    slug,
    offset,
    limit
  }: {
    slug: string;
    offset: number;
    limit: number;
  }) => [...projectKeys.forWorkspaceCertificates(slug), { offset, limit }] as const,
  getWorkspacePkiAlerts: (projectId: string) => [{ projectId }, "project-pki-alerts"] as const,
  getWorkspacePkiSubscribers: (projectId: string) =>
    [{ projectId }, "project-pki-subscribers"] as const,
  getWorkspacePkiCollections: (projectId: string) =>
    [{ projectId }, "project-pki-collections"] as const,
  getWorkspaceCertificateTemplates: (projectId: string) =>
    [{ projectId }, "project-certificate-templates"] as const,
  getWorkspaceWorkflowIntegrationConfig: (
    projectId: string,
    integration: WorkflowIntegrationPlatform
  ) => [{ projectId, integration }, "project-workflow-integration-config"] as const,
  getWorkspaceSshCas: (projectId: string) => [{ projectId }, "project-ssh-cas"] as const,
  allWorkspaceSshCertificates: (projectId: string) =>
    [{ projectId }, "project-ssh-certificates"] as const,
  getWorkspaceSshHosts: (projectId: string) => [{ projectId }, "project-ssh-hosts"] as const,
  getWorkspaceSshHostGroups: (projectId: string) =>
    [{ projectId }, "project-ssh-host-groups"] as const,
  specificWorkspaceSshCertificates: ({
    offset,
    limit,
    projectId
  }: {
    offset: number;
    limit: number;
    projectId: string;
  }) => [...projectKeys.allWorkspaceSshCertificates(projectId), { offset, limit }] as const,
  getWorkspaceSshCertificateTemplates: (projectId: string) =>
    [{ projectId }, "project-ssh-certificate-templates"] as const,
  getProjectSshConfig: (projectId: string) => [{ projectId }, "project-ssh-config"] as const
};
