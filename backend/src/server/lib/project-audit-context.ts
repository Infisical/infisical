import { requestContext } from "@fastify/request-context";

import type { TAccessBundlePermissionService } from "@app/domains/agent-vault/agent-vault/ce/module";
import type { TApplicationPermissionService } from "@app/domains/certificates/cert-manager/ce/module";
import type { TSignerPermissionService } from "@app/domains/certificates/code-signing/ce/module";
import type { TKmsPermissionService } from "@app/domains/kms/kms/ce/module";
import type { TPamPermissionService } from "@app/domains/pam/pam/ce/module";
import type { ActorGrants } from "@app/domains/platform/access-control/ce/module";
import type { Project, TProjectPermissionService } from "@app/domains/platform/projects/ce/module";
import type { TSecretsPermissionService } from "@app/domains/secrets-manager/secrets/ce/module";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";

// The project a request acted in and the actor's attributes there, for the audit log, the permission-denied audit
// hook, the error handler and API metrics. The domains never touch the request, so the composition root records it
// around the permission services, as the legacy engine did inside each project check.
const record = <T extends { project: Project | null; grants: ActorGrants }>(permission: T): T => {
  const { project, grants } = permission;
  if (project) {
    requestContext.set(RequestContextKey.ProjectDetails, { id: project.id, name: project.name, slug: project.slug });
    requestContext.set(RequestContextKey.IdentityPermissionMetadata, { metadata: grants.attributeMap() });
  }
  return permission;
};

export const withProjectAuditContext = {
  projectPermission: (service: TProjectPermissionService): TProjectPermissionService => ({
    getProjectPermission: async (input) => record(await service.getProjectPermission(input)),
    getProjectAccess: async (input) => record(await service.getProjectAccess(input)),
    findProjectAccess: async (input) => {
      const access = await service.findProjectAccess(input);
      return access ? record(access) : access;
    },
    getProjectRoles: (input) => service.getProjectRoles(input),
    getProjectPermissionByRoles: (input) => service.getProjectPermissionByRoles(input),
    getGrantPermissions: (input) => service.getGrantPermissions(input),
    getPermissionAuditSources: (input) => service.getPermissionAuditSources(input)
  }),
  secretsPermission: (service: TSecretsPermissionService): TSecretsPermissionService => ({
    getSecretsPermission: async (input) => {
      const result = await service.getSecretsPermission(input);
      record(result.permission);
      return result;
    },
    getProjectPermissionWithFolderGrants: async (input) => {
      const permission = await service.getProjectPermissionWithFolderGrants(input);
      record(permission);
      return permission;
    },
    getProjectMemberPermissions: (input) => service.getProjectMemberPermissions(input),
    getFolderGrantAuditSources: (input) => service.getFolderGrantAuditSources(input),
    getFolderGrantPermissions: (input) => service.getFolderGrantPermissions(input),
    getPermissionFingerprint: (input) => service.getPermissionFingerprint(input),
    getPermissionCacheFingerprint: (input) => service.getPermissionCacheFingerprint(input),
    invalidateFolderGrants: (input) => service.invalidateFolderGrants(input),
    within: (tx) => service.within(tx)
  }),
  kmsPermission: (service: TKmsPermissionService): TKmsPermissionService => ({
    getKmsPermission: async (input) => record(await service.getKmsPermission(input))
  }),
  pamPermission: (service: TPamPermissionService): TPamPermissionService => ({
    getPamPermission: async (input) => record(await service.getPamPermission(input))
  }),
  applicationPermission: (service: TApplicationPermissionService): TApplicationPermissionService => ({
    getApplicationPermission: async (input) => record(await service.getApplicationPermission(input))
  }),
  signerPermission: (service: TSignerPermissionService): TSignerPermissionService => ({
    getSignerPermission: async (input) => record(await service.getSignerPermission(input))
  }),
  accessBundlePermission: (service: TAccessBundlePermissionService): TAccessBundlePermissionService => ({
    getAgentVaultPermission: async (input) => {
      const result = await service.getAgentVaultPermission(input);
      record(result.permission);
      return result;
    },
    getAccessBundlePermission: async (input) => {
      const result = await service.getAccessBundlePermission(input);
      record(result.permission);
      return result;
    },
    getGrantedAccessBundlePermission: async (input) => {
      const result = await service.getGrantedAccessBundlePermission(input);
      record(result.permission);
      return result;
    },
    findReachableAccessBundleIds: (input) => service.findReachableAccessBundleIds(input),
    intersectAccessBundleIds: (a, b) => service.intersectAccessBundleIds(a, b)
  })
};
