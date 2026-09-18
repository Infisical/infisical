import type { VaultDatabaseRole } from "@app/hooks/api/migration/types";

export type VaultRoleImportEngine =
  | "cassandra"
  | "kubernetes"
  | "kubernetesAuth"
  | "ldap"
  | "sqlDatabase";

export type VaultMount = { path: string; type: string; version?: string | null };

type VaultRoleImportConfig = {
  actionLabel: string;
  description: string;
  infoText?: string;
  mountHelpText: string;
  mountLabel: string;
  mountPlaceholder: string;
  mountTooltip: string;
  mountType: string;
  namespaceHelpText: string;
  namespaceTooltip: string;
  noMountsMessage: string;
  roleHelpText: string;
  roleLabel: string;
  rolePlaceholder: string;
  roleSelectionMessage: string;
  scope: "org" | "project";
  title: string;
};

export const VAULT_ROLE_IMPORT_CONFIG: Record<VaultRoleImportEngine, VaultRoleImportConfig> = {
  ldap: {
    title: "Load from HashiCorp Vault",
    description: "Select an LDAP secrets engine role to load its configuration.",
    infoText:
      "Select an LDAP secrets engine role from Vault to pre-fill the form with its configuration including connection details, LDIF statements, TTL settings, etc.",
    namespaceTooltip: "Select the Vault namespace containing the LDAP secrets engine.",
    namespaceHelpText: "Select the Vault namespace to fetch available LDAP secrets engines",
    mountType: "ldap",
    mountLabel: "LDAP Secrets Engine",
    mountTooltip: "Select the LDAP secrets engine mount to fetch available roles.",
    mountHelpText: "Choose an LDAP secrets engine mount to list available roles",
    mountPlaceholder: "Select LDAP secrets engine...",
    roleLabel: "LDAP Role",
    roleHelpText: "Choose an LDAP role from the selected mount to load its configuration",
    rolePlaceholder: "Select a role to load...",
    roleSelectionMessage: "Please select a Vault LDAP role to load",
    noMountsMessage:
      "No Vault mounts found. Please ensure you have LDAP secrets engine configured.",
    actionLabel: "Load Configuration",
    scope: "project"
  },
  sqlDatabase: {
    title: "Load from HashiCorp Vault",
    description: "Select a database secrets engine role to load its configuration.",
    infoText:
      "Select a database secrets engine role from Vault to pre-fill the form with its configuration including connection details, creation/revocation statements, TTL settings, etc.",
    namespaceTooltip: "Select the Vault namespace containing the database secrets engine.",
    namespaceHelpText: "Select the Vault namespace to fetch available database secrets engines",
    mountType: "database",
    mountLabel: "Database Secrets Engine",
    mountTooltip: "Select the database secrets engine mount to fetch available roles.",
    mountHelpText: "Choose a database secrets engine mount to list available roles",
    mountPlaceholder: "Select database secrets engine...",
    roleLabel: "Database Role",
    roleHelpText:
      "Choose a database dynamic role from the selected mount to load its configuration",
    rolePlaceholder: "Select a role to load...",
    roleSelectionMessage: "Please select a Vault database role to load",
    noMountsMessage:
      "No Vault mounts found. Please ensure you have database secrets engine configured.",
    actionLabel: "Load Configuration",
    scope: "project"
  },
  cassandra: {
    title: "Load from HashiCorp Vault",
    description: "Select a Cassandra database role to load its configuration.",
    infoText:
      "Select a Cassandra database role from Vault to pre-fill the form with its configuration including connection details, creation/revocation statements, TTL settings, etc.",
    namespaceTooltip: "Select the Vault namespace containing the database secrets engine.",
    namespaceHelpText: "Select the Vault namespace to fetch available database secrets engines",
    mountType: "database",
    mountLabel: "Database Secrets Engine",
    mountTooltip: "Select the database secrets engine mount to fetch available Cassandra roles.",
    mountHelpText: "Choose a database secrets engine mount to list available Cassandra roles",
    mountPlaceholder: "Select database secrets engine...",
    roleLabel: "Cassandra Role",
    roleHelpText: "Choose a Cassandra role from the selected mount to load its configuration",
    rolePlaceholder: "Select a role to load...",
    roleSelectionMessage: "Please select a Vault Cassandra role to load",
    noMountsMessage:
      "No Vault mounts found. Please ensure you have database secrets engine configured.",
    actionLabel: "Load Configuration",
    scope: "project"
  },
  kubernetes: {
    title: "Load from HashiCorp Vault",
    description: "Select a Kubernetes secrets engine role to load its configuration.",
    infoText:
      "Select a Kubernetes secrets engine role from Vault to pre-fill the form with its configuration including cluster URL, CA certificate, TTL settings, etc.",
    namespaceTooltip: "Select the Vault namespace containing the Kubernetes secrets engine.",
    namespaceHelpText: "Select the Vault namespace to fetch available Kubernetes secrets engines",
    mountType: "kubernetes",
    mountLabel: "Kubernetes Secrets Engine",
    mountTooltip: "Select the Kubernetes secrets engine mount to fetch available roles.",
    mountHelpText: "Choose a Kubernetes secrets engine mount to list available roles",
    mountPlaceholder: "Select Kubernetes secrets engine...",
    roleLabel: "Kubernetes Role",
    roleHelpText: "Choose a Kubernetes role from the selected mount to load its configuration",
    rolePlaceholder: "Select a role to load...",
    roleSelectionMessage: "Please select a Vault Kubernetes role to load",
    noMountsMessage:
      "No Vault mounts found. Please ensure you have Kubernetes secrets engine configured.",
    actionLabel: "Load Configuration",
    scope: "project"
  },
  kubernetesAuth: {
    title: "Load Kubernetes Auth from HashiCorp Vault",
    description:
      "Load Kubernetes authentication configuration from your Vault instance. The auth method and role settings will be automatically translated and prefilled in the form.",
    namespaceTooltip: "Select the Vault namespace containing the Kubernetes auth configuration.",
    namespaceHelpText: "Select the Vault namespace to fetch available auth mounts",
    mountType: "kubernetes",
    mountLabel: "Auth Engine",
    mountTooltip: "Select the Kubernetes auth engine to narrow down available roles.",
    mountHelpText: "Choose a Kubernetes auth engine to filter available roles",
    mountPlaceholder: "Select auth engine...",
    roleLabel: "Kubernetes Role",
    roleHelpText: "Select the Kubernetes role to load configuration from",
    rolePlaceholder: "Select a Kubernetes role to load...",
    roleSelectionMessage: "Please select a Kubernetes role to load",
    noMountsMessage:
      "No Vault auth mounts found. Please ensure you have Kubernetes authentication configured.",
    actionLabel: "Load",
    scope: "org"
  }
};

export const getVaultRoleImportMounts = (
  engine: VaultRoleImportEngine,
  mounts: VaultMount[] | undefined
) => mounts?.filter((mount) => mount.type === VAULT_ROLE_IMPORT_CONFIG[engine].mountType) ?? [];

export const getVaultRoleImportRoles = <TRole extends { name: string }>(
  engine: VaultRoleImportEngine,
  roles: TRole[] | undefined
) => {
  if (engine !== "cassandra") return roles ?? [];

  return (
    (roles as Array<TRole & VaultDatabaseRole> | undefined)?.filter((role) =>
      role.config.plugin_name?.toLowerCase().includes("cassandra")
    ) ?? []
  );
};
