import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  ExternalMigrationProviders,
  TExternalMigrationConfig,
  VaultKubernetesAuthRole
} from "./types";

export const externalMigrationQueryKeys = {
  customMigrationAvailable: (provider: ExternalMigrationProviders) => [
    "custom-migration-available",
    provider
  ],
  config: (platform: string) => ["external-migration-config", { platform }],
  vaultNamespaces: () => ["vault-namespaces"],
  vaultPolicies: () => ["vault-policies"],
  vaultMounts: () => ["vault-mounts"],
  vaultSecretPaths: () => ["vault-secret-paths"],
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

export const useGetExternalMigrationConfig = (platform: string) => {
  return useQuery({
    queryKey: externalMigrationQueryKeys.config(platform),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ config: TExternalMigrationConfig | null }>(
        "/api/v3/external-migration/config",
        {
          params: { platform }
        }
      );
      return data.config;
    },
    enabled: Boolean(platform)
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
    queryKey: externalMigrationQueryKeys.vaultPolicies(),
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
    queryKey: externalMigrationQueryKeys.vaultMounts(),
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
    queryKey: externalMigrationQueryKeys.vaultSecretPaths(),
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
