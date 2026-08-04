import { type ReactNode, useEffect, useState } from "react";
import { InfoIcon } from "lucide-react";

import {
  defaultVaultConnectionId,
  VaultConnectionAndNamespaceFields
} from "@app/components/external-migrations";
import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { FilterableSelect } from "@app/components/v3/generic/ReactSelect";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import {
  useGetVaultDatabaseRoles,
  useGetVaultKubernetesRoles,
  useGetVaultLdapRoles,
  useGetVaultMounts
} from "@app/hooks/api/migration/queries";
import {
  VaultDatabaseRole,
  VaultKubernetesRole,
  VaultLdapRole
} from "@app/hooks/api/migration/types";

export type VaultRoleImportEngine = "kubernetes" | "ldap" | "sqlDatabase" | "cassandra";

type RoleWithName = { name: string };

type EngineCopy = {
  subtitle: string;
  description: string;
  mountLabel: string;
  mountTooltip: string;
  mountHelpText: string;
  mountPlaceholder: string;
  roleLabel: string;
  roleHelpText: string;
  namespaceTooltip: string;
  namespaceHelpText: string;
  selectRoleError: string;
  noMountsError: string;
  emptyRolesPlaceholder?: string;
};

const ENGINE_COPY: Record<VaultRoleImportEngine, EngineCopy> = {
  kubernetes: {
    subtitle: "Select a Kubernetes secrets engine role to load its configuration.",
    description:
      "Select a Kubernetes secrets engine role from Vault to pre-fill the form with its configuration including cluster URL, CA certificate, TTL settings, etc.",
    mountLabel: "Kubernetes Secrets Engine",
    mountTooltip: "Select the Kubernetes secrets engine mount to fetch available roles.",
    mountHelpText: "Choose a Kubernetes secrets engine mount to list available roles",
    mountPlaceholder: "Select Kubernetes secrets engine...",
    roleLabel: "Kubernetes Role",
    roleHelpText: "Choose a Kubernetes role from the selected mount to load its configuration",
    namespaceTooltip: "Select the Vault namespace containing the Kubernetes secrets engine.",
    namespaceHelpText: "Select the Vault namespace to fetch available Kubernetes secrets engines",
    selectRoleError: "Please select a Vault Kubernetes role to load",
    noMountsError:
      "No Vault mounts found. Please ensure you have Kubernetes secrets engine configured."
  },
  ldap: {
    subtitle: "Select an LDAP secrets engine role to load its configuration.",
    description:
      "Select an LDAP secrets engine role from Vault to pre-fill the form with its configuration including connection details, LDIF statements, TTL settings, etc.",
    mountLabel: "LDAP Secrets Engine",
    mountTooltip: "Select the LDAP secrets engine mount to fetch available roles.",
    mountHelpText: "Choose an LDAP secrets engine mount to list available roles",
    mountPlaceholder: "Select LDAP secrets engine...",
    roleLabel: "LDAP Role",
    roleHelpText: "Choose an LDAP role from the selected mount to load its configuration",
    namespaceTooltip: "Select the Vault namespace containing the LDAP secrets engine.",
    namespaceHelpText: "Select the Vault namespace to fetch available LDAP secrets engines",
    selectRoleError: "Please select a Vault LDAP role to load",
    noMountsError: "No Vault mounts found. Please ensure you have LDAP secrets engine configured."
  },
  sqlDatabase: {
    subtitle: "Select a database secrets engine role to load its configuration.",
    description:
      "Select a database secrets engine role from Vault to pre-fill the form with its configuration including connection details, creation/revocation statements, TTL settings, etc.",
    mountLabel: "Database Secrets Engine",
    mountTooltip: "Select the database secrets engine mount to fetch available roles.",
    mountHelpText: "Choose a database secrets engine mount to list available roles",
    mountPlaceholder: "Select database secrets engine...",
    roleLabel: "Database Role",
    roleHelpText: "Choose a database dynamic role from the selected mount to load its configuration",
    namespaceTooltip: "Select the Vault namespace containing the database secrets engine.",
    namespaceHelpText: "Select the Vault namespace to fetch available database secrets engines",
    selectRoleError: "Please select a Vault database role to load",
    noMountsError:
      "No Vault mounts found. Please ensure you have database secrets engine configured."
  },
  cassandra: {
    subtitle: "Select a Cassandra database role to load its configuration.",
    description:
      "Select a Cassandra database role from Vault to pre-fill the form with its configuration including connection details, creation/revocation statements, TTL settings, etc.",
    mountLabel: "Database Secrets Engine",
    mountTooltip: "Select the database secrets engine mount to fetch available Cassandra roles.",
    mountHelpText: "Choose a database secrets engine mount to list available Cassandra roles",
    mountPlaceholder: "Select database secrets engine...",
    roleLabel: "Cassandra Role",
    roleHelpText: "Choose a Cassandra role from the selected mount to load its configuration",
    namespaceTooltip: "Select the Vault namespace containing the database secrets engine.",
    namespaceHelpText: "Select the Vault namespace to fetch available database secrets engines",
    selectRoleError: "Please select a Vault Cassandra role to load",
    noMountsError:
      "No Vault mounts found. Please ensure you have database secrets engine configured.",
    emptyRolesPlaceholder: "No Cassandra roles found..."
  }
};

const mountTypeForEngine = (engine: VaultRoleImportEngine) => {
  if (engine === "kubernetes") return "kubernetes";
  if (engine === "ldap") return "ldap";
  return "database";
};

const useVaultRolesForEngine = (
  engine: VaultRoleImportEngine,
  shouldFetchRoles: boolean,
  namespace: string | undefined,
  mountPath: string | undefined,
  connectionId: string | undefined
) => {
  const kubernetes = useGetVaultKubernetesRoles(
    engine === "kubernetes" && shouldFetchRoles,
    namespace,
    mountPath,
    connectionId
  );
  const ldap = useGetVaultLdapRoles(
    engine === "ldap" && shouldFetchRoles,
    namespace,
    mountPath,
    connectionId
  );
  const database = useGetVaultDatabaseRoles(
    (engine === "sqlDatabase" || engine === "cassandra") && shouldFetchRoles,
    namespace,
    mountPath,
    connectionId
  );

  if (engine === "kubernetes") {
    return {
      roles: (kubernetes.data ?? []) as RoleWithName[],
      isLoading: kubernetes.isLoading
    };
  }

  if (engine === "ldap") {
    return {
      roles: (ldap.data ?? []) as RoleWithName[],
      isLoading: ldap.isLoading
    };
  }

  const databaseRoles = database.data ?? [];
  const roles =
    engine === "cassandra"
      ? databaseRoles.filter((role) => role.config.plugin_name?.toLowerCase().includes("cassandra"))
      : databaseRoles;

  return {
    roles: roles as RoleWithName[],
    isLoading: database.isLoading
  };
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  appConnections: TAvailableAppConnection[];
  engine: VaultRoleImportEngine;
  onImport: (role: RoleWithName) => void;
};

const FieldLabelWithTooltip = ({
  children,
  tooltip
}: {
  children: ReactNode;
  tooltip: string;
}) => (
  <FieldLabel>
    {children}
    <Tooltip>
      <TooltipTrigger>
        <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{tooltip}</TooltipContent>
    </Tooltip>
  </FieldLabel>
);

const Content = ({
  onClose,
  appConnections,
  engine,
  onImport
}: {
  onClose: () => void;
  appConnections: TAvailableAppConnection[];
  engine: VaultRoleImportEngine;
  onImport: (role: RoleWithName) => void;
}) => {
  const copy = ENGINE_COPY[engine];
  const hasAppConnections = appConnections.length > 0;
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(
    defaultVaultConnectionId(appConnections)
  );
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
  const [selectedMountPath, setSelectedMountPath] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<RoleWithName | null>(null);
  const [shouldFetchRoles, setShouldFetchRoles] = useState(false);
  const [shouldFetchMounts, setShouldFetchMounts] = useState(false);

  const activeConnectionId = hasAppConnections ? (selectedConnectionId ?? undefined) : undefined;

  const { roles, isLoading: isLoadingRoles } = useVaultRolesForEngine(
    engine,
    shouldFetchRoles,
    selectedNamespace ?? undefined,
    selectedMountPath ?? undefined,
    activeConnectionId
  );
  const { data: mounts, isLoading: isLoadingMounts } = useGetVaultMounts(
    shouldFetchMounts,
    selectedNamespace ?? undefined,
    activeConnectionId
  );

  const filteredMounts = mounts?.filter((mount) => mount.type === mountTypeForEngine(engine));

  const handleConnectionChange = (id: string) => {
    setSelectedConnectionId(id);
    setSelectedNamespace(null);
    setSelectedMountPath(null);
    setSelectedRole(null);
    setShouldFetchMounts(false);
    setShouldFetchRoles(false);
  };

  const handleNamespaceChange = (ns: string) => {
    setSelectedNamespace(ns);
    setSelectedMountPath(null);
    setSelectedRole(null);
  };

  useEffect(() => {
    if (selectedNamespace) {
      setShouldFetchMounts(true);
    }
  }, [selectedNamespace]);

  useEffect(() => {
    if (selectedNamespace && selectedMountPath) {
      setShouldFetchRoles(true);
    } else {
      setShouldFetchRoles(false);
    }
  }, [selectedNamespace, selectedMountPath]);

  const handleImport = () => {
    if (!selectedRole) {
      createNotification({ type: "error", text: copy.selectRoleError });
      return;
    }

    if (!selectedNamespace) {
      createNotification({ type: "error", text: "Please select a namespace" });
      return;
    }

    if (hasAppConnections && !selectedConnectionId) {
      createNotification({ type: "error", text: "Please select an app connection" });
      return;
    }

    if (!mounts || mounts.length === 0) {
      createNotification({ type: "error", text: copy.noMountsError });
      return;
    }

    onImport(selectedRole);
    onClose();
  };

  const rolePlaceholder = (() => {
    if (!selectedMountPath) return "Select a mount path first...";
    if (copy.emptyRolesPlaceholder && roles.length === 0) return copy.emptyRolesPlaceholder;
    return "Select a role to load...";
  })();

  return (
    <>
      <div className="mb-4 flex items-start gap-3 rounded-md border border-project/20 bg-project/5 p-3 text-sm text-project">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <p className="text-xs leading-relaxed text-foreground/75">{copy.description}</p>
      </div>

      <div className="space-y-4">
        <VaultConnectionAndNamespaceFields
          appConnections={appConnections}
          connectionId={selectedConnectionId}
          onConnectionIdChange={handleConnectionChange}
          namespace={selectedNamespace}
          onNamespaceChange={handleNamespaceChange}
          namespaceTooltip={copy.namespaceTooltip}
          namespaceHelpText={copy.namespaceHelpText}
        />

        <Field>
          <FieldLabelWithTooltip tooltip={copy.mountTooltip}>{copy.mountLabel}</FieldLabelWithTooltip>
          <FieldContent>
            <FilterableSelect
              value={filteredMounts?.find((mount) => mount.path === selectedMountPath) ?? null}
              onChange={(value) => {
                const mount = Array.isArray(value) ? value[0] : value;
                if (mount) {
                  setSelectedMountPath(mount.path.replace(/\/$/, ""));
                  setSelectedRole(null);
                }
              }}
              options={filteredMounts || []}
              getOptionValue={(option) => option.path}
              getOptionLabel={(option) => option.path.replace(/\/$/, "")}
              isDisabled={isLoadingMounts || !filteredMounts?.length}
              placeholder={copy.mountPlaceholder}
            />
          </FieldContent>
          <FieldDescription>{copy.mountHelpText}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel>{copy.roleLabel}</FieldLabel>
          <FieldContent>
            <FilterableSelect
              value={selectedRole}
              onChange={(value) => {
                const role = Array.isArray(value) ? value[0] : value;
                setSelectedRole(role ?? null);
              }}
              options={roles}
              getOptionValue={(option) => option.name}
              getOptionLabel={(option) => option.name}
              isDisabled={isLoadingRoles || !roles.length || !selectedMountPath}
              placeholder={rolePlaceholder}
              isClearable
            />
          </FieldContent>
          <FieldDescription>{copy.roleHelpText}</FieldDescription>
        </Field>
      </div>

      <DialogFooter className="mt-6 gap-2 sm:gap-2">
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="button"
          variant="project"
          onClick={handleImport}
          isDisabled={!selectedRole || isLoadingMounts || isLoadingRoles}
        >
          Load Configuration
        </Button>
      </DialogFooter>
    </>
  );
};

export const VaultRoleImportModal = ({
  isOpen,
  onOpenChange,
  appConnections,
  engine,
  onImport
}: Props) => {
  const copy = ENGINE_COPY[engine];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-visible" showCloseButton>
        <DialogHeader>
          <DialogTitle>Load from HashiCorp Vault</DialogTitle>
          <DialogDescription>{copy.subtitle}</DialogDescription>
        </DialogHeader>
        {isOpen && (
          <Content
            onClose={() => onOpenChange(false)}
            appConnections={appConnections}
            engine={engine}
            onImport={onImport}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

type EngineModalProps<TRole extends RoleWithName> = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  appConnections: TAvailableAppConnection[];
  onImport: (role: TRole) => void;
};

export const VaultKubernetesImportModal = ({
  onImport,
  ...props
}: EngineModalProps<VaultKubernetesRole>) => (
  <VaultRoleImportModal
    {...props}
    engine="kubernetes"
    onImport={(role) => onImport(role as VaultKubernetesRole)}
  />
);

export const VaultLdapImportModal = ({ onImport, ...props }: EngineModalProps<VaultLdapRole>) => (
  <VaultRoleImportModal
    {...props}
    engine="ldap"
    onImport={(role) => onImport(role as VaultLdapRole)}
  />
);

export const VaultSqlDatabaseImportModal = ({
  onImport,
  ...props
}: EngineModalProps<VaultDatabaseRole>) => (
  <VaultRoleImportModal
    {...props}
    engine="sqlDatabase"
    onImport={(role) => onImport(role as VaultDatabaseRole)}
  />
);

export const VaultCassandraImportModal = ({
  onImport,
  ...props
}: EngineModalProps<VaultDatabaseRole>) => (
  <VaultRoleImportModal
    {...props}
    engine="cassandra"
    onImport={(role) => onImport(role as VaultDatabaseRole)}
  />
);
