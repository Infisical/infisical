import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  ExternalMigrationProviders,
  TVaultExternalMigrationConfig,
  VaultKubernetesAuthRole
} from "./types";

export const externalMigrationQueryKeys = {
  customMigrationAvailable: (provider: ExternalMigrationProviders) => [
    "custom-migration-available",
    provider
  ],
  vaultConfigs: () => ["vault-external-migration-configs"],
  vaultNamespaces: () => ["vault-namespaces"],
  vaultPolicies: (namespace?: string) => ["vault-policies", namespace],
  vaultMounts: (namespace?: string) => ["vault-mounts", namespace],
  vaultSecretPaths: (namespace?: string) => ["vault-secret-paths", namespace],
  vaultKubernetesAuthRoles: (namespace?: string) => ["vault-kubernetes-auth-roles", namespace]
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

export const useGetVaultExternalMigrationConfigs = () => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultConfigs(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ configs: TVaultExternalMigrationConfig[] }>(
        "/api/v3/external-migration/vault/configs"
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

export const useGetVaultSecretPaths = (enabled = true, namespace?: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultSecretPaths(namespace),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        secretPaths: string[];
      }>("/api/v3/external-migration/vault/secret-paths", {
        params: {
          namespace
        }
      });

      return data.secretPaths;
    },
    enabled
  });
};

export const useGetVaultKubernetesAuthRoles = (enabled = true, namespace?: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.vaultKubernetesAuthRoles(namespace),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        roles: VaultKubernetesAuthRole[];
      }>("/api/v3/external-migration/vault/auth-roles/kubernetes", {
        params: {
          namespace
        }
      });

      return data.roles;
    },
    enabled
  });
};
