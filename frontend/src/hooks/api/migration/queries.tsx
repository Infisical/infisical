import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  ExternalMigrationProviders,
  TDopplerConfig,
  TDopplerEnvironment,
  TDopplerProject,
  VaultDatabaseRole,
  VaultKubernetesAuthRole,
  VaultKubernetesRole,
  VaultLdapRole
} from "./types";

export const externalMigrationQueryKeys = {
  customMigrationAvailable: (provider: ExternalMigrationProviders) => [
    "custom-migration-available",
    provider
  ],
  vaultNamespaces: (connectionId?: string) => ["vault-namespaces", connectionId],
  vaultPolicies: (namespace?: string, connectionId?: string) => [
    "vault-policies",
    namespace,
    connectionId
  ],
  vaultMounts: (namespace?: string, connectionId?: string) => [
    "vault-mounts",
    namespace,
    connectionId
  ],
  vaultAuthMounts: (namespace?: string, authType?: string, connectionId?: string) => [
    "vault-auth-mounts",
    namespace,
    authType,
    connectionId
  ],
  vaultSecretPaths: (namespace?: string, mountPath?: string, connectionId?: string) => [
    "vault-secret-paths",
    namespace,
    mountPath,
    connectionId
  ],
  vaultKubernetesAuthRoles: (namespace?: string, mountPath?: string, connectionId?: string) => [
    "vault-kubernetes-auth-roles",
    namespace,
    mountPath,
    connectionId
  ],
  vaultKubernetesRoles: (namespace?: string, mountPath?: string, connectionId?: string) => [
    "vault-kubernetes-roles",
    namespace,
    mountPath,
    connectionId
  ],
  vaultDatabaseRoles: (namespace?: string, mountPath?: string, connectionId?: string) => [
    "vault-database-roles",
    namespace,
    mountPath,
    connectionId
  ],
  vaultLdapRoles: (namespace?: string, mountPath?: string, connectionId?: string) => [
    "vault-ldap-roles",
    namespace,
    mountPath,
    connectionId
  ],
  dopplerProjects: (connectionId?: string) => ["doppler-projects", connectionId],
  dopplerEnvironments: (connectionId?: string, projectSlug?: string) => [
    "doppler-environments",
    connectionId,
    projectSlug
  ],
  dopplerConfigs: (connectionId?: string, projectSlug?: string) => [
    "doppler-configs",
    connectionId,
    projectSlug
  ]
};

export const useHasCustomMigrationAvailable = (provider: ExternalMigrationProviders) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.customMigrationAvailable(provider),
    queryFn: () =>
      apiRequest.get<{ enabled: boolean }>(
        `/api/v3/external-migration/custom-migration-enabled/${provider}`
      )
  });
};

export const useGetVaultNamespaces = (connectionId?: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultNamespaces(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        namespaces: Array<{ id: string; name: string }>;
      }>("/api/v3/external-migration/vault/namespaces", {
        params: { connectionId }
      });
      return data.namespaces;
    },
    enabled: !!connectionId
  });
};

export const useGetVaultPolicies = (enabled = true, namespace?: string, connectionId?: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultPolicies(namespace, connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        policies: Array<{ name: string; rules: string }>;
      }>("/api/v3/external-migration/vault/policies", {
        params: {
          namespace,
          connectionId
        }
      });

      return data.policies;
    },
    enabled: enabled && !!connectionId
  });
};

export const useGetVaultMounts = (enabled = true, namespace?: string, connectionId?: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultMounts(namespace, connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        mounts: Array<{ path: string; type: string; version: string | null }>;
      }>("/api/v3/external-migration/vault/mounts", {
        params: {
          namespace,
          connectionId
        }
      });

      return data.mounts;
    },
    enabled: enabled && !!connectionId
  });
};

export const useGetVaultSecretPaths = (
  enabled = true,
  namespace?: string,
  mountPath?: string,
  connectionId?: string
) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultSecretPaths(namespace, mountPath, connectionId),
    queryFn: async () => {
      if (!namespace || !mountPath) {
        throw new Error("Both namespace and mountPath are required");
      }

      const { data } = await apiRequest.get<{
        secretPaths: string[];
        skippedWildcardPaths: string[];
      }>("/api/v3/external-migration/vault/secret-paths", {
        params: {
          namespace,
          mountPath,
          connectionId
        }
      });

      return data;
    },
    enabled: enabled && !!namespace && !!mountPath && !!connectionId
  });
};

export const useGetVaultAuthMounts = (
  enabled = true,
  namespace?: string,
  authType?: string,
  connectionId?: string
) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultAuthMounts(namespace, authType, connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        mounts: Array<{ path: string; type: string }>;
      }>("/api/v3/external-migration/vault/auth-mounts", {
        params: {
          namespace,
          ...(authType && { authType }),
          connectionId
        }
      });

      return data.mounts;
    },
    enabled: enabled && !!connectionId
  });
};

export const useGetVaultKubernetesAuthRoles = (
  enabled = true,
  namespace?: string,
  mountPath?: string,
  connectionId?: string
) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultKubernetesAuthRoles(
      namespace,
      mountPath,
      connectionId
    ),
    queryFn: async () => {
      if (!namespace || !mountPath) {
        throw new Error("Both namespace and mountPath are required");
      }

      const { data } = await apiRequest.get<{
        roles: VaultKubernetesAuthRole[];
      }>("/api/v3/external-migration/vault/auth-roles/kubernetes", {
        params: {
          namespace,
          mountPath,
          connectionId
        }
      });

      return data.roles;
    },
    enabled: enabled && !!namespace && !!mountPath && !!connectionId
  });
};

export const useGetVaultKubernetesRoles = (
  enabled = true,
  namespace?: string,
  mountPath?: string,
  connectionId?: string
) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultKubernetesRoles(namespace, mountPath, connectionId),
    queryFn: async () => {
      if (!namespace || !mountPath) {
        throw new Error("Both namespace and mountPath are required");
      }

      const { data } = await apiRequest.get<{
        roles: VaultKubernetesRole[];
      }>("/api/v3/external-migration/vault/kubernetes-roles", {
        params: {
          namespace,
          mountPath,
          connectionId
        }
      });

      return data.roles;
    },
    enabled: enabled && !!namespace && !!mountPath && !!connectionId
  });
};

export const useGetVaultDatabaseRoles = (
  enabled = true,
  namespace?: string,
  mountPath?: string,
  connectionId?: string
) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultDatabaseRoles(namespace, mountPath, connectionId),
    queryFn: async () => {
      if (!namespace || !mountPath) {
        throw new Error("Both namespace and mountPath are required");
      }

      const { data } = await apiRequest.get<{
        roles: VaultDatabaseRole[];
      }>("/api/v3/external-migration/vault/database-roles", {
        params: {
          namespace,
          mountPath,
          connectionId
        }
      });

      return data.roles;
    },
    enabled: enabled && !!namespace && !!mountPath && !!connectionId
  });
};

export const useGetVaultLdapRoles = (
  enabled = true,
  namespace?: string,
  mountPath?: string,
  connectionId?: string
) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultLdapRoles(namespace, mountPath, connectionId),
    queryFn: async () => {
      if (!namespace || !mountPath) {
        throw new Error("Both namespace and mountPath are required");
      }

      const { data } = await apiRequest.get<{
        roles: VaultLdapRole[];
      }>("/api/v3/external-migration/vault/ldap-roles", {
        params: {
          namespace,
          mountPath,
          connectionId
        }
      });

      return data.roles;
    },
    enabled: enabled && !!namespace && !!mountPath && !!connectionId
  });
};

export const useGetDopplerProjects = (connectionId?: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.dopplerProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ projects: TDopplerProject[] }>(
        "/api/v3/external-migration/doppler/projects",
        {
          params: { connectionId }
        }
      );
      return data.projects;
    },
    enabled: !!connectionId
  });
};

export const useGetDopplerEnvironments = (connectionId?: string, projectSlug?: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.dopplerEnvironments(connectionId, projectSlug),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ environments: TDopplerEnvironment[] }>(
        "/api/v3/external-migration/doppler/environments",
        {
          params: { connectionId, projectSlug }
        }
      );
      return data.environments;
    },
    enabled: !!connectionId && !!projectSlug
  });
};

export const useGetDopplerConfigs = (connectionId?: string, projectSlug?: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.dopplerConfigs(connectionId, projectSlug),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ configs: TDopplerConfig[] }>(
        "/api/v3/external-migration/doppler/doppler-configs",
        {
          params: { connectionId, projectSlug }
        }
      );
      return data.configs;
    },
    enabled: !!connectionId && !!projectSlug
  });
};
