import type { CaStatus } from "../ca";
import { WorkflowIntegrationPlatform } from "../workflowIntegrations/types";
import { TListProjectIdentitiesDTO, TSearchProjectsDTO } from "./types";

export const projectKeys = {
  getProjectById: (projectId: string) => ["projects", { projectId }] as const,
  getProjectSecrets: (projectId: string) => [{ projectId }, "project-secrets"] as const,
  getProjectIndexStatus: (projectId: string) => [{ projectId }, "project-index-status"] as const,
  getProjectUpgradeStatus: (projectId: string) => [{ projectId }, "project-upgrade-status"],
  getProjectMemberships: (orgId: string) => [{ orgId }, "project-memberships"],
  getProjectAuthorization: (projectId: string) => [{ projectId }, "project-authorizations"],
  getProjectIntegrations: (projectId: string) => [{ projectId }, "project-integrations"],
  getAllUserProjects: () => ["projects"] as const,
  getProjectAuditLogs: (projectId: string) => [{ projectId }, "project-audit-logs"] as const,
  getProjectUsers: (
    projectId: string,
    includeGroupMembers: boolean = false,
    roles: string[] = []
  ) => [{ projectId, includeGroupMembers, roles }, "project-users"] as const,
  getProjectUserDetails: (projectId: string, membershipId: string) =>
    [{ projectId, membershipId }, "project-user-details"] as const,
  getProjectIdentityMemberships: (projectId: string) =>
    [{ projectId }, "project-identity-memberships"] as const,
  getProjectIdentityMembershipDetails: (projectId: string, identityId: string) =>
    [{ projectId, identityId }, "project-identity-membership-details"] as const,
  getProjectIdentityMembershipDetailsV2: (projectId: string, identityId: string) =>
    [{ projectId, identityId }, "project-identity-membership-details"] as const,
  // allows invalidation using above key without knowing params
  getProjectIdentityMembershipsWithParams: ({ projectId, ...params }: TListProjectIdentitiesDTO) =>
    [...projectKeys.getProjectIdentityMemberships(projectId), params] as const,
  searchProject: (dto: TSearchProjectsDTO) => ["search-projects", dto] as const,
  getProjectGroupMemberships: (projectId: string) => [{ projectId }, "project-groups"] as const,
  getProjectGroupMembershipDetails: (projectId: string, groupId: string) =>
    [{ projectId, groupId }, "project-group-membership-details"] as const,
  getProjectCas: ({ projectId }: { projectId: string }) => [{ projectId }, "project-cas"] as const,
  specificProjectCas: ({ projectId, status }: { projectId: string; status?: CaStatus }) =>
    [...projectKeys.getProjectCas({ projectId }), { status }] as const,
  allProjectCertificates: () => ["project-certificates"] as const,
  forProjectCertificates: (projectId: string) =>
    [...projectKeys.allProjectCertificates(), projectId] as const,
  specificProjectCertificates: ({
    projectId,
    offset,
    limit,
    friendlyName,
    commonName,
    forPkiSync
  }: {
    projectId: string;
    offset: number;
    limit: number;
    friendlyName?: string;
    commonName?: string;
    forPkiSync?: boolean;
  }) =>
    [
      ...projectKeys.forProjectCertificates(projectId),
      { offset, limit, friendlyName, commonName, forPkiSync }
    ] as const,
  getProjectPkiAlerts: (projectId: string) => [{ projectId }, "project-pki-alerts"] as const,
  getProjectPkiSubscribers: (projectId: string) =>
    [{ projectId }, "project-pki-subscribers"] as const,
  getProjectPkiCollections: (projectId: string) =>
    [{ projectId }, "project-pki-collections"] as const,
  getProjectCertificateTemplates: (projectId: string) =>
    [{ projectId }, "project-certificate-templates"] as const,
  getProjectWorkflowIntegrationConfig: (
    projectId: string,
    integration: WorkflowIntegrationPlatform
  ) => [{ projectId, integration }, "project-workflow-integration-config"] as const,
  getProjectSshCas: (projectId: string) => [{ projectId }, "project-ssh-cas"] as const,
  allProjectSshCertificates: (projectId: string) =>
    [{ projectId }, "project-ssh-certificates"] as const,
  getProjectSshHosts: (projectId: string) => [{ projectId }, "project-ssh-hosts"] as const,
  getProjectSshHostGroups: (projectId: string) =>
    [{ projectId }, "project-ssh-host-groups"] as const,
  specificProjectSshCertificates: ({
    offset,
    limit,
    projectId
  }: {
    offset: number;
    limit: number;
    projectId: string;
  }) => [...projectKeys.allProjectSshCertificates(projectId), { offset, limit }] as const,
  getProjectSshCertificateTemplates: (projectId: string) =>
    [{ projectId }, "project-ssh-certificate-templates"] as const,
  getProjectSshConfig: (projectId: string) => [{ projectId }, "project-ssh-config"] as const
};
