import { ProjectType } from "@app/hooks/api/projects/types";

export const isCertManagerProject = (type?: string): boolean =>
  type === ProjectType.CertificateManager;

export const userMembershipsBase = (type?: string, projectId?: string): string =>
  isCertManagerProject(type)
    ? "/api/v1/cert-manager/access/users"
    : `/api/v1/projects/${projectId ?? ""}/memberships`;

export const identityMembershipsBase = (type?: string, projectId?: string): string =>
  isCertManagerProject(type)
    ? "/api/v1/cert-manager/access/identities"
    : `/api/v1/projects/${projectId ?? ""}/memberships/identities`;

export const groupMembershipsBase = (type?: string, projectId?: string): string =>
  isCertManagerProject(type)
    ? "/api/v1/cert-manager/access/groups"
    : `/api/v1/projects/${projectId ?? ""}/memberships/groups`;

export const rolesBase = (type?: string, projectId?: string): string =>
  isCertManagerProject(type)
    ? "/api/v1/cert-manager/access/roles"
    : `/api/v1/projects/${projectId ?? ""}/roles`;

export const availableIdentitiesUrl = (type?: string, projectId?: string): string =>
  isCertManagerProject(type)
    ? "/api/v1/cert-manager/access/available-identities"
    : `/api/v1/projects/${projectId ?? ""}/memberships/available-identities`;
