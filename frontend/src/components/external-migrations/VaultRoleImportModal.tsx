import { useReducer } from "react";
import { InfoIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Button,
  Combobox,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription
} from "@app/components/v3";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import {
  useGetVaultAuthMounts,
  useGetVaultDatabaseRoles,
  useGetVaultKubernetesAuthRoles,
  useGetVaultKubernetesRoles,
  useGetVaultLdapRoles,
  useGetVaultMounts
} from "@app/hooks/api/migration/queries";
import {
  VaultDatabaseRole,
  VaultKubernetesAuthRole,
  VaultKubernetesRole,
  VaultLdapRole
} from "@app/hooks/api/migration/types";

import {
  VaultConnectionAndNamespaceFields,
  VaultFieldLabel
} from "./VaultConnectionAndNamespaceFields";
import { createVaultImportSelection, vaultImportSelectionReducer } from "./vaultImportSelection";
import {
  getVaultRoleImportMounts,
  getVaultRoleImportRoles,
  VAULT_ROLE_IMPORT_CONFIG,
  VaultMount,
  VaultRoleImportEngine
} from "./VaultRoleImportModal.utils";

type VaultRole = VaultDatabaseRole | VaultKubernetesAuthRole | VaultKubernetesRole | VaultLdapRole;

type BaseProps<TRole extends VaultRole> = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  appConnections: TAvailableAppConnection[];
  onImport: (role: TRole) => void;
};

type ContentProps<TRole extends VaultRole> = {
  appConnections: TAvailableAppConnection[];
  engine: VaultRoleImportEngine;
  onClose: () => void;
  onImport: (role: TRole) => void;
};

const VaultRoleImportContent = <TRole extends VaultRole>({
  appConnections,
  engine,
  onClose,
  onImport
}: ContentProps<TRole>) => {
  const config = VAULT_ROLE_IMPORT_CONFIG[engine];
  const hasAppConnections = appConnections.length > 0;
  const [state, dispatch] = useReducer(
    vaultImportSelectionReducer<TRole>,
    appConnections.map(({ id }) => id),
    createVaultImportSelection<TRole>
  );
  const { connectionId, mountPath, namespace, selection: selectedRole } = state;
  const activeConnectionId = hasAppConnections ? (connectionId ?? undefined) : undefined;
  const shouldFetchMounts = Boolean(namespace && activeConnectionId);
  const shouldFetchRoles = Boolean(namespace && mountPath && activeConnectionId);
  const isAuthImport = engine === "kubernetesAuth";

  const vaultMountsQuery = useGetVaultMounts(
    shouldFetchMounts && !isAuthImport,
    namespace ?? undefined,
    activeConnectionId
  );
  const authMountsQuery = useGetVaultAuthMounts(
    shouldFetchMounts && isAuthImport,
    namespace ?? undefined,
    "kubernetes",
    activeConnectionId
  );
  const ldapRolesQuery = useGetVaultLdapRoles(
    shouldFetchRoles && engine === "ldap",
    namespace ?? undefined,
    mountPath ?? undefined,
    activeConnectionId
  );
  const databaseRolesQuery = useGetVaultDatabaseRoles(
    shouldFetchRoles && (engine === "sqlDatabase" || engine === "cassandra"),
    namespace ?? undefined,
    mountPath ?? undefined,
    activeConnectionId
  );
  const kubernetesRolesQuery = useGetVaultKubernetesRoles(
    shouldFetchRoles && engine === "kubernetes",
    namespace ?? undefined,
    mountPath ?? undefined,
    activeConnectionId
  );
  const kubernetesAuthRolesQuery = useGetVaultKubernetesAuthRoles(
    shouldFetchRoles && isAuthImport,
    namespace ?? undefined,
    mountPath ?? undefined,
    activeConnectionId
  );

  const mountsQuery = isAuthImport ? authMountsQuery : vaultMountsQuery;
  const mounts = getVaultRoleImportMounts(engine, mountsQuery.data as VaultMount[] | undefined);
  const rawRoles = (() => {
    if (engine === "ldap") return ldapRolesQuery.data;
    if (engine === "kubernetes") return kubernetesRolesQuery.data;
    if (engine === "kubernetesAuth") return kubernetesAuthRolesQuery.data;
    return databaseRolesQuery.data;
  })() as TRole[] | undefined;
  const roles = getVaultRoleImportRoles(engine, rawRoles) as TRole[];
  const rolesQuery = (() => {
    if (engine === "ldap") return ldapRolesQuery;
    if (engine === "kubernetes") return kubernetesRolesQuery;
    if (engine === "kubernetesAuth") return kubernetesAuthRolesQuery;
    return databaseRolesQuery;
  })();
  const idPrefix = `vault-${engine}-import`;
  const mountInputId = `${idPrefix}-mount`;
  const roleInputId = `${idPrefix}-role`;
  let { rolePlaceholder } = config;
  if (!mountPath) {
    rolePlaceholder = isAuthImport
      ? "Select an auth engine first..."
      : "Select a mount path first...";
  }

  const handleImport = () => {
    if (!selectedRole) {
      createNotification({ type: "error", text: config.roleSelectionMessage });
      return;
    }
    if (!namespace) {
      createNotification({ type: "error", text: "Please select a namespace" });
      return;
    }
    if (hasAppConnections && !connectionId) {
      createNotification({ type: "error", text: "Please select an app connection" });
      return;
    }
    if (!mounts.length) {
      createNotification({ type: "error", text: config.noMountsMessage });
      return;
    }

    onImport(selectedRole);
    onClose();
  };

  return (
    <>
      <DialogBody className="space-y-5">
        {config.infoText && (
          <Alert variant="project">
            <InfoIcon />
            <AlertDescription>{config.infoText}</AlertDescription>
          </Alert>
        )}

        <VaultConnectionAndNamespaceFields
          appConnections={appConnections}
          connectionId={connectionId}
          onConnectionIdChange={(value) => dispatch({ type: "connection", value })}
          namespace={namespace}
          onNamespaceChange={(value) => dispatch({ type: "namespace", value })}
          namespaceTooltip={config.namespaceTooltip}
          namespaceHelpText={config.namespaceHelpText}
          idPrefix={idPrefix}
        />

        <Field>
          <VaultFieldLabel
            htmlFor={mountInputId}
            tooltip={config.mountTooltip}
            tooltipLabel={config.mountLabel}
          >
            {config.mountLabel}
          </VaultFieldLabel>
          <Combobox
            id={mountInputId}
            value={mounts.find((mount) => mount.path.replace(/\/$/, "") === mountPath) ?? null}
            onValueChange={(mount) =>
              dispatch({ type: "mount", value: mount.path.replace(/\/$/, "") })
            }
            onClear={() => dispatch({ type: "mount", value: null })}
            options={mounts}
            getOptionValue={(mount) => mount.path}
            getOptionLabel={(mount) => mount.path.replace(/\/$/, "")}
            isDisabled={!namespace || mountsQuery.isLoading || !mounts.length}
            isLoading={mountsQuery.isLoading}
            isError={mountsQuery.isError}
            placeholder={namespace ? config.mountPlaceholder : "Select a namespace first..."}
            searchPlaceholder={`Search ${config.mountLabel.toLowerCase()}...`}
            searchAriaLabel={`Search ${config.mountLabel}`}
            clearAriaLabel={`Clear ${config.mountLabel}`}
            emptyMessage={`No ${config.mountLabel.toLowerCase()} found.`}
            modal
          />
          <FieldDescription>{config.mountHelpText}</FieldDescription>
        </Field>

        <Field>
          <VaultFieldLabel
            htmlFor={roleInputId}
            tooltip={config.roleHelpText}
            tooltipLabel={config.roleLabel}
          >
            {config.roleLabel}
          </VaultFieldLabel>
          <Combobox
            id={roleInputId}
            value={selectedRole}
            onValueChange={(value) => dispatch({ type: "selection", value })}
            onClear={() => dispatch({ type: "selection", value: null })}
            options={roles}
            getOptionValue={(role) => role.name}
            getOptionLabel={(role) => role.name}
            isDisabled={!mountPath || rolesQuery.isLoading || !roles.length}
            isLoading={rolesQuery.isLoading}
            isError={rolesQuery.isError}
            placeholder={rolePlaceholder}
            searchPlaceholder={`Search ${config.roleLabel.toLowerCase()}...`}
            searchAriaLabel={`Search ${config.roleLabel}`}
            clearAriaLabel={`Clear ${config.roleLabel}`}
            emptyMessage={`No ${config.roleLabel.toLowerCase()} found.`}
            modal
          />
          <FieldDescription>{config.roleHelpText}</FieldDescription>
        </Field>
      </DialogBody>

      <DialogFooter>
        <DialogClose asChild>
          <Button>Cancel</Button>
        </DialogClose>
        <Button
          variant={config.scope}
          onClick={handleImport}
          isDisabled={!selectedRole || mountsQuery.isLoading || rolesQuery.isLoading}
        >
          {config.actionLabel}
        </Button>
      </DialogFooter>
    </>
  );
};

type VaultRoleImportModalProps<TRole extends VaultRole> = BaseProps<TRole> & {
  engine: VaultRoleImportEngine;
};

const VaultRoleImportModal = <TRole extends VaultRole>({
  isOpen,
  onOpenChange,
  appConnections,
  onImport,
  engine
}: VaultRoleImportModalProps<TRole>) => {
  const config = VAULT_ROLE_IMPORT_CONFIG[engine];

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {isOpen && (
        <DialogContent className="max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{config.title}</DialogTitle>
            <DialogDescription>{config.description}</DialogDescription>
          </DialogHeader>
          <VaultRoleImportContent
            appConnections={appConnections}
            engine={engine}
            onClose={() => onOpenChange(false)}
            onImport={onImport}
          />
        </DialogContent>
      )}
    </Dialog>
  );
};

export const VaultLdapImportModal = (props: BaseProps<VaultLdapRole>) => (
  <VaultRoleImportModal {...props} engine="ldap" />
);

export const VaultSqlDatabaseImportModal = (props: BaseProps<VaultDatabaseRole>) => (
  <VaultRoleImportModal {...props} engine="sqlDatabase" />
);

export const VaultCassandraImportModal = (props: BaseProps<VaultDatabaseRole>) => (
  <VaultRoleImportModal {...props} engine="cassandra" />
);

export const VaultKubernetesImportModal = (props: BaseProps<VaultKubernetesRole>) => (
  <VaultRoleImportModal {...props} engine="kubernetes" />
);

export const VaultKubernetesAuthImportModal = (props: BaseProps<VaultKubernetesAuthRole>) => (
  <VaultRoleImportModal {...props} engine="kubernetesAuth" />
);
