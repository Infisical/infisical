import { requestContext } from "@fastify/request-context";

import type { TAgentVaultDomain } from "@app/domains/agent-vault/agent-vault/ce/module";
import type { TKmsDomain } from "@app/domains/kms/kms/ce/module";
import type { ProjectPermission, TProjectsDomain } from "@app/domains/platform/projects/ce/module";
import type { TSecretScanningDomain } from "@app/domains/secrets-manager/secret-scanning/ce/module";
import type { TSecretsDomain } from "@app/domains/secrets-manager/secrets/ce/module";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";

// The project a request acted in and the actor's attributes there, for the audit log, the permission-denied audit
// hook, the error handler and API metrics. The domains never touch the request, so the composition root records it
// around their project permission functions.
const record = (permission: ProjectPermission) => {
  const { project } = permission;
  requestContext.set(RequestContextKey.ProjectDetails, { id: project.id, name: project.name, slug: project.slug });
  requestContext.set(RequestContextKey.IdentityPermissionMetadata, { metadata: permission.grants.attributeMap() });
  return permission;
};

export const withProjectAuditContext = {
  projects: (domain: TProjectsDomain): TProjectsDomain => ({
    ...domain,
    getProjectPermission: async (input) => record(await domain.getProjectPermission(input))
  }),
  secrets: (domain: TSecretsDomain): TSecretsDomain => ({
    ...domain,
    getSecretsPermission: async (input) => {
      const result = await domain.getSecretsPermission(input);
      record(result.permission);
      return result;
    }
  }),
  kms: (domain: TKmsDomain): TKmsDomain => ({
    ...domain,
    getKmsPermission: async (input) => record(await domain.getKmsPermission(input))
  }),
  secretScanning: (domain: TSecretScanningDomain): TSecretScanningDomain => ({
    ...domain,
    getSecretScanningPermission: async (input) => record(await domain.getSecretScanningPermission(input))
  }),
  agentVault: (domain: TAgentVaultDomain): TAgentVaultDomain => ({
    ...domain,
    getAccessBundlePermission: async (input) => {
      const result = await domain.getAccessBundlePermission(input);
      record(result.project);
      return result;
    }
  })
};
