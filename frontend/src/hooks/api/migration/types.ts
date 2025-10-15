export enum ExternalMigrationProviders {
  Vault = "vault",
  EnvKey = "env-key"
}

export enum VaultImportStatus {
  Imported = "imported",
  ApprovalRequired = "approval_required"
}

export type TVaultExternalMigrationConfig = {
  id: string;
  orgId: string;
  namespace: string;
  connectionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TImportVaultSecretsDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
  vaultNamespace: string;
  vaultSecretPath: string;
};

export type VaultKubernetesAuthRole = {
  name: string;
  bound_service_account_names: string[];
  bound_service_account_namespaces: string[];
  token_ttl?: number;
  token_max_ttl?: number;
  token_policies?: string[];
  token_bound_cidrs?: string[];
  token_explicit_max_ttl?: number;
  token_no_default_policy?: boolean;
  token_num_uses?: number;
  token_period?: number;
  token_type?: string;
  audience?: string;
  alias_name_source?: string;
  mountPath: string;
  config: {
    kubernetes_host: string;
    kubernetes_ca_cert?: string;
    issuer?: string;
    disable_iss_validation?: boolean;
    disable_local_ca_jwt?: boolean;
  };
};
