import { TListProjectIdentitiesDTO } from "@app/hooks/api/workspace/types";

import type { CaStatus } from "../ca";

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
  // allows invalidation using above key without knowing params
  getWorkspaceIdentityMembershipsWithParams: ({
    workspaceId,
    ...params
  }: TListProjectIdentitiesDTO) =>
    [...workspaceKeys.getWorkspaceIdentityMemberships(workspaceId), params] as const,
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
  getWorkspacePkiCollections: (workspaceId: string) =>
    [{ workspaceId }, "workspace-pki-collections"] as const,
  getWorkspaceCertificateTemplates: (workspaceId: string) =>
    [{ workspaceId }, "workspace-certificate-templates"] as const,
  getWorkspaceSlackConfig: (workspaceId: string) =>
    [{ workspaceId }, "workspace-slack-config"] as const
};
