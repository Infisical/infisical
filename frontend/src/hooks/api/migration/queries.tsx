import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  ExternalMigrationProviders,
  TDopplerConfig,
  TDopplerEnvironment,
  TDopplerProject,
  TExternalMigrationConfig,
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
  configs: (provider: ExternalMigrationProviders) => ["external-migration-configs", provider],
  vaultNamespaces: () => ["vault-namespaces"],
  vaultPolicies: (namespace?: string) => ["vault-policies", namespace],
  vaultMounts: (namespace?: string) => ["vault-mounts", namespace],
  vaultAuthMounts: (namespace?: string, authType?: string) => [
    "vault-auth-mounts",
    namespace,
    authType
  ],
  vaultSecretPaths: (namespace?: string, mountPath?: string) => [
    "vault-secret-paths",
    namespace,
    mountPath
  ],
  vaultKubernetesAuthRoles: (namespace?: string, mountPath?: string) => [
    "vault-kubernetes-auth-roles",
    namespace,
    mountPath
  ],
  vaultKubernetesRoles: (namespace?: string, mountPath?: string) => [
    "vault-kubernetes-roles",
    namespace,
    mountPath
  ],
  vaultDatabaseRoles: (namespace?: string, mountPath?: string) => [
    "vault-database-roles",
    namespace,
    mountPath
  ],
  vaultLdapRoles: (namespace?: string, mountPath?: string) => [
    "vault-ldap-roles",
    namespace,
    mountPath
  ],
  dopplerProjects: (configId?: string) => ["doppler-projects", configId],
  dopplerEnvironments: (configId?: string, projectSlug?: string) => [
    "doppler-environments",
    configId,
    projectSlug
  ],
  dopplerConfigs: (configId?: string, projectSlug?: string) => [
    "doppler-configs",
    configId,
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

export const useGetExternalMigrationConfigs = (provider: ExternalMigrationProviders) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.configs(provider),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ configs: TExternalMigrationConfig[] }>(
        `/api/v3/external-migration/${provider}/configs`
      );
      return data.configs;
    }
  });
};

export const useGetVaultNamespaces = () => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultNamespaces(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        namespaces: Array<{ id: string; name: string }>;
      }>("/api/v3/external-migration/vault/namespaces");
      return data.namespaces;
    }
  });
};

export const useGetVaultPolicies = (enabled = true, namespace?: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultPolicies(namespace),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        policies: Array<{ name: string; rules: string }>;
      }>("/api/v3/external-migration/vault/policies", {
        params: {
          namespace
        }
      });

      return data.policies;
    },
    enabled
  });
};

export const useGetVaultMounts = (enabled = true, namespace?: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultMounts(namespace),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        mounts: Array<{ path: string; type: string; version: string | null }>;
      }>("/api/v3/external-migration/vault/mounts", {
        params: {
          namespace
        }
      });

      return data.mounts;
    },
    enabled
  });
};

export const useGetVaultSecretPaths = (enabled = true, namespace?: string, mountPath?: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultSecretPaths(namespace, mountPath),
    queryFn: async () => {
      if (!namespace || !mountPath) {
        throw new Error("Both namespace and mountPath are required");
      }

      const { data } = await apiRequest.get<{
        secretPaths: string[];
      }>("/api/v3/external-migration/vault/secret-paths", {
        params: {
          namespace,
          mountPath
        }
      });

      return data.secretPaths;
    },
    enabled: enabled && !!namespace && !!mountPath
  });
};

export const useGetVaultAuthMounts = (enabled = true, namespace?: string, authType?: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultAuthMounts(namespace, authType),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        mounts: Array<{ path: string; type: string }>;
      }>("/api/v3/external-migration/vault/auth-mounts", {
        params: {
          namespace,
          ...(authType && { authType })
        }
      });

      return data.mounts;
    },
    enabled
  });
};

export const useGetVaultKubernetesAuthRoles = (
  enabled = true,
  namespace?: string,
  mountPath?: string
) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultKubernetesAuthRoles(namespace, mountPath),
    queryFn: async () => {
      if (!namespace || !mountPath) {
        throw new Error("Both namespace and mountPath are required");
      }

      const { data } = await apiRequest.get<{
        roles: VaultKubernetesAuthRole[];
      }>("/api/v3/external-migration/vault/auth-roles/kubernetes", {
        params: {
          namespace,
          mountPath
        }
      });

      return data.roles;
    },
    enabled: enabled && !!namespace && !!mountPath
  });
};

export const useGetVaultKubernetesRoles = (
  enabled = true,
  namespace?: string,
  mountPath?: string
) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultKubernetesRoles(namespace, mountPath),
    queryFn: async () => {
      if (!namespace || !mountPath) {
        throw new Error("Both namespace and mountPath are required");
      }

      const { data } = await apiRequest.get<{
        roles: VaultKubernetesRole[];
      }>("/api/v3/external-migration/vault/kubernetes-roles", {
        params: {
          namespace,
          mountPath
        }
      });

      return data.roles;
    },
    enabled: enabled && !!namespace && !!mountPath
  });
};

export const useGetVaultDatabaseRoles = (
  enabled = true,
  namespace?: string,
  mountPath?: string
) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultDatabaseRoles(namespace, mountPath),
    queryFn: async () => {
      if (!namespace || !mountPath) {
        throw new Error("Both namespace and mountPath are required");
      }

      const { data } = await apiRequest.get<{
        roles: VaultDatabaseRole[];
      }>("/api/v3/external-migration/vault/database-roles", {
        params: {
          namespace,
          mountPath
        }
      });

      return data.roles;
    },
    enabled: enabled && !!namespace && !!mountPath
  });
};

export const useGetVaultLdapRoles = (enabled = true, namespace?: string, mountPath?: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultLdapRoles(namespace, mountPath),
    queryFn: async () => {
      if (!namespace || !mountPath) {
        throw new Error("Both namespace and mountPath are required");
      }

      const { data } = await apiRequest.get<{
        roles: VaultLdapRole[];
      }>("/api/v3/external-migration/vault/ldap-roles", {
        params: {
          namespace,
          mountPath
        }
      });

      return data.roles;
    },
    enabled: enabled && !!namespace && !!mountPath
  });
};

export const useGetDopplerProjects = (configId?: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.dopplerProjects(configId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ projects: TDopplerProject[] }>(
        "/api/v3/external-migration/doppler/projects",
        {
          params: { configId }
        }
      );
      return data.projects;
    },
    enabled: !!configId
  });
};

export const useGetDopplerEnvironments = (configId?: string, projectSlug?: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.dopplerEnvironments(configId, projectSlug),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ environments: TDopplerEnvironment[] }>(
        "/api/v3/external-migration/doppler/environments",
        {
          params: { configId, projectSlug }
        }
      );
      return data.environments;
    },
    enabled: !!configId && !!projectSlug
  });
};

export const useGetDopplerConfigs = (configId?: string, projectSlug?: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.dopplerConfigs(configId, projectSlug),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ configs: TDopplerConfig[] }>(
        "/api/v3/external-migration/doppler/doppler-configs",
        {
          params: { configId, projectSlug }
        }
      );
      return data.configs;
    },
    enabled: !!configId && !!projectSlug
  });
};
