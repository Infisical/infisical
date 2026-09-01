import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import {
  buildVaultImportPreview,
  VaultConnectionAndNamespaceFields,
  VaultFieldLabel,
  VaultImportPreview
} from "@app/components/external-migrations";
import {
  createVaultImportSelection,
  vaultImportSelectionReducer
} from "@app/components/external-migrations/vaultImportSelection";
import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Checkbox,
  Combobox,
  DiscardChangesAlertDialog,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useBadgeOverflow } from "@app/components/v3/generic/DataGrid/hooks/use-badge-overflow";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import { useGetVaultMounts, useGetVaultSecretPaths } from "@app/hooks/api/migration/queries";
import { useDiscardChangesGuard } from "@app/hooks/useDiscardChangesGuard";

export type TVaultSecretImportArgs = {
  vaultPaths: string[];
  namespace: string;
  mountPath: string;
  connectionId: string;
  keepVaultStructure: boolean;
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  appConnections: TAvailableAppConnection[];
  destinationPath: string;
  onImport: (args: TVaultSecretImportArgs) => void;
};

type ContentProps = {
  onClose: () => void;
  appConnections: TAvailableAppConnection[];
  destinationPath: string;
  onImport: (args: TVaultSecretImportArgs) => void;
  onDirtyChange: (isDirty: boolean) => void;
};

const MAX_PATH_LENGTH = 30;

const getDisplayPath = (path: string) =>
  path.length > MAX_PATH_LENGTH ? `…${path.slice(path.length - MAX_PATH_LENGTH)}` : path;

const renderWildcardPath = (path: string) => {
  const isTruncated = path.length > MAX_PATH_LENGTH;
  const visiblePath = isTruncated ? path.slice(path.length - MAX_PATH_LENGTH) : path;
  let position = 0;

  return (
    <span title={path}>
      {isTruncated && "…"}
      {visiblePath.split(/(\+)/).map((part) => {
        const key = `${path}-${position}`;
        position += part.length;

        return part === "+" ? (
          <code key={key} className="font-semibold text-warning">
            +
          </code>
        ) : (
          part
        );
      })}
    </span>
  );
};

const Content = ({
  onClose,
  appConnections,
  destinationPath,
  onImport,
  onDirtyChange
}: ContentProps) => {
  const hasAppConnections = appConnections.length > 0;
  const [keepVaultStructure, setKeepVaultStructure] = useState(false);
  const [state, dispatch] = useReducer(
    vaultImportSelectionReducer<string[]>,
    appConnections.map(({ id }) => id),
    createVaultImportSelection<string[]>
  );
  const { connectionId, mountPath, namespace } = state;
  const selectedPaths = useMemo(() => state.selection ?? [], [state.selection]);
  const initialConnectionIdRef = useRef(connectionId);
  const isDirty =
    connectionId !== initialConnectionIdRef.current ||
    Boolean(namespace) ||
    Boolean(mountPath) ||
    selectedPaths.length > 0 ||
    keepVaultStructure;

  useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);

  const activeConnectionId = hasAppConnections ? (connectionId ?? undefined) : undefined;
  const shouldFetchMounts = Boolean(namespace && activeConnectionId);
  const shouldFetchPaths = Boolean(namespace && mountPath && activeConnectionId);

  const vaultSecretPathsQuery = useGetVaultSecretPaths(
    shouldFetchPaths,
    namespace ?? undefined,
    mountPath ?? undefined,
    activeConnectionId
  );
  const secretPaths = vaultSecretPathsQuery.data?.secretPaths ?? [];
  const skippedWildcardPaths = vaultSecretPathsQuery.data?.skippedWildcardPaths ?? [];
  const mountsQuery = useGetVaultMounts(
    shouldFetchMounts,
    namespace ?? undefined,
    activeConnectionId
  );
  const kvMounts =
    mountsQuery.data?.filter((mount) => mount.type === "kv" || mount.type.startsWith("kv")) ?? [];
  const pathOptions = secretPaths.map((path) => ({ path }));
  const selectedPathOptions = selectedPaths.map((path) => ({ path }));

  const badgeContainerRef = useRef<HTMLDivElement>(null);
  const { visibleItems: visibleSkippedPaths, hiddenCount } = useBadgeOverflow({
    items: skippedWildcardPaths,
    getLabel: (path) => getDisplayPath(path),
    containerRef: badgeContainerRef,
    lineCount: 3,
    className: "font-mono",
    overflowBadgeWidth: 60
  });
  const hiddenSkippedPaths = skippedWildcardPaths.slice(visibleSkippedPaths.length);

  const preview = useMemo(
    () =>
      buildVaultImportPreview({
        selectedPaths,
        destinationPath,
        mountPath: mountPath ?? "",
        keepVaultStructure
      }),
    [selectedPaths, destinationPath, mountPath, keepVaultStructure]
  );
  const { invalidPaths } = preview;

  const handleImport = () => {
    if (!selectedPaths.length) {
      createNotification({
        type: "error",
        text: "Please select at least one Vault secret path to import"
      });
      return;
    }
    if (!connectionId) {
      createNotification({ type: "error", text: "Please select an app connection" });
      return;
    }
    if (!namespace) {
      createNotification({ type: "error", text: "Please select a namespace" });
      return;
    }
    if (!kvMounts.length) {
      createNotification({
        type: "error",
        text: "No Vault mounts found. Please ensure you have KV secret engines configured."
      });
      return;
    }
    if (!mountPath) {
      createNotification({ type: "error", text: "Please select a secrets engine" });
      return;
    }

    onImport({ vaultPaths: selectedPaths, namespace, mountPath, connectionId, keepVaultStructure });
    onClose();
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col space-y-5 overflow-y-auto p-4">
        <VaultConnectionAndNamespaceFields
          appConnections={appConnections}
          connectionId={connectionId}
          onConnectionIdChange={(value) => dispatch({ type: "connection", value })}
          namespace={namespace}
          onNamespaceChange={(value) => dispatch({ type: "namespace", value })}
          namespaceTooltip="Select the Vault namespace containing the secrets you want to import."
          namespaceHelpText="Select the Vault namespace to fetch available mounts"
          idPrefix="vault-secret-import"
        />

        <Field>
          <VaultFieldLabel
            htmlFor="vault-secret-import-mount"
            tooltip="Select the KV secrets engine to narrow down secret paths."
            tooltipLabel="Secrets Engine"
          >
            Secrets Engine
          </VaultFieldLabel>
          <Combobox
            id="vault-secret-import-mount"
            value={kvMounts.find((mount) => mount.path.replace(/\/$/, "") === mountPath) ?? null}
            onValueChange={(mount) =>
              dispatch({ type: "mount", value: mount.path.replace(/\/$/, "") })
            }
            onClear={() => dispatch({ type: "mount", value: null })}
            options={kvMounts}
            getOptionValue={(mount) => mount.path}
            getOptionLabel={(mount) => mount.path.replace(/\/$/, "")}
            isDisabled={!namespace || mountsQuery.isLoading || !kvMounts.length}
            isLoading={mountsQuery.isLoading}
            isError={mountsQuery.isError}
            placeholder={namespace ? "Select secrets engine..." : "Select a namespace first..."}
            searchPlaceholder="Search secrets engines..."
            searchAriaLabel="Search Secrets Engine"
            clearAriaLabel="Clear Secrets Engine"
            emptyMessage="No KV secrets engines found."
            modal
          />
          <FieldDescription>
            Choose a KV secrets engine to filter available secret paths
          </FieldDescription>
        </Field>

        <Field>
          <VaultFieldLabel
            htmlFor="vault-secret-import-paths"
            tooltip="Choose one or more secret paths from the selected mount to import into Infisical."
            tooltipLabel="Vault Secret Path"
          >
            Vault Secret Path
          </VaultFieldLabel>
          <Combobox
            id="vault-secret-import-paths"
            multiple
            isSelectAll
            value={selectedPathOptions}
            onValueChange={(options) =>
              dispatch({ type: "selection", value: options.map(({ path }) => path) })
            }
            onClear={() => dispatch({ type: "selection", value: [] })}
            options={pathOptions}
            getOptionValue={(option) => option.path}
            getOptionLabel={(option) => option.path}
            isDisabled={!mountPath || vaultSecretPathsQuery.isLoading || !secretPaths.length}
            isLoading={vaultSecretPathsQuery.isLoading}
            isError={vaultSecretPathsQuery.isError}
            placeholder={
              mountPath ? "Select Vault path(s) to import..." : "Select a mount path first..."
            }
            searchPlaceholder="Search Vault secret paths..."
            searchAriaLabel="Search Vault secret paths"
            clearAriaLabel="Clear Vault secret paths"
            emptyMessage="No Vault secret paths found."
            modal
          />
          <FieldDescription>
            Choose one or more secret paths from the selected mount to import into Infisical
          </FieldDescription>
        </Field>

        <Field
          orientation="horizontal"
          className="rounded-md border border-border bg-container px-3.5 py-3"
        >
          <Checkbox
            id="vault-secret-import-keep-structure"
            variant="project"
            isChecked={keepVaultStructure}
            onCheckedChange={(checked) => setKeepVaultStructure(checked === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor="vault-secret-import-keep-structure" className="cursor-pointer">
              Preserve folder structure
            </FieldLabel>
            <FieldDescription>
              Create folders inside Infisical, matching the selected Vault secret&apos;s path.
            </FieldDescription>
          </FieldContent>
        </Field>

        {invalidPaths.length > 0 && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>
              {invalidPaths.length} secret path
              {invalidPaths.length > 1 ? "s cannot become folders" : " cannot become a folder"}
            </AlertTitle>
            <AlertDescription>
              <p>
                Infisical folder names allow only letters, numbers, dashes and underscores. Rename
                the following {invalidPaths.length > 1 ? "paths" : "path"} in Vault, or import
                without preserving the folder structure.
              </p>
              <div className="mt-2 flex flex-wrap items-start gap-1">
                {invalidPaths.map((path) => (
                  <Badge
                    isTruncatable
                    key={path}
                    variant="warning"
                    className="font-mono text-foreground/80"
                  >
                    {path}
                  </Badge>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {selectedPaths.length > 0 && <VaultImportPreview preview={preview} />}

        {skippedWildcardPaths.length > 0 && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>
              {skippedWildcardPaths.length} secret path
              {skippedWildcardPaths.length > 1 ? "s are" : " is"} unavailable
            </AlertTitle>
            <AlertDescription>
              <p>
                {skippedWildcardPaths.length} secret path
                {skippedWildcardPaths.length > 1 ? "s are" : " is"} not available for selection.
                Vault imports don&apos;t support wildcard (
                <code className="text-warning/80">+</code>) paths. In Vault, update the policy on
                the App role or token behind this App Connection to grant access to absolute paths
                instead.
              </p>
              <div ref={badgeContainerRef} className="mt-2 flex flex-wrap items-start gap-1">
                {visibleSkippedPaths.map((path) => (
                  <Badge key={path} variant="warning" className="font-mono text-foreground/80">
                    {renderWildcardPath(path)}
                  </Badge>
                ))}
                {hiddenCount > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Show ${hiddenCount} more unavailable secret paths`}
                        className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Badge variant="warning" className="cursor-default font-mono">
                          +{hiddenCount} more
                        </Badge>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm p-2">
                      <div className="flex flex-wrap gap-1">
                        {hiddenSkippedPaths.map((path) => (
                          <Badge
                            isTruncatable
                            key={path}
                            variant="warning"
                            className="font-mono text-foreground/80"
                          >
                            {renderWildcardPath(path)}
                          </Badge>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}
      </div>

      <SheetFooter className="border-t">
        <SheetClose asChild>
          <Button variant="ghost">Cancel</Button>
        </SheetClose>
        <Button
          variant="project"
          onClick={handleImport}
          isDisabled={
            !selectedPaths.length ||
            invalidPaths.length > 0 ||
            mountsQuery.isLoading ||
            vaultSecretPathsQuery.isLoading
          }
        >
          Import Secrets
        </Button>
      </SheetFooter>
    </>
  );
};

export const VaultSecretImportModal = ({
  isOpen,
  onOpenChange,
  appConnections,
  destinationPath,
  onImport
}: Props) => {
  const [isDirty, setIsDirty] = useState(false);

  const closeSheet = useCallback(() => {
    setIsDirty(false);
    onOpenChange(false);
  }, [onOpenChange]);

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: closeSheet });

  const handleSheetOpenChange = (open: boolean) => {
    if (!open) {
      requestDiscard();
      return;
    }
    onOpenChange(true);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
        {isOpen && (
          <SheetContent
            className="sm:max-w-2xl"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <div className="flex size-5 items-center justify-center rounded-full bg-foreground/75">
                  <img src="/images/integrations/Vault.png" alt="" className="mt-0.5 size-4" />
                </div>
                Import from HashiCorp Vault
              </SheetTitle>
              <SheetDescription>
                Select a Vault namespace and one or more secret paths to import secrets into the
                current environment and folder.
              </SheetDescription>
            </SheetHeader>
            <Content
              onClose={closeSheet}
              appConnections={appConnections}
              destinationPath={destinationPath}
              onImport={onImport}
              onDirtyChange={setIsDirty}
            />
          </SheetContent>
        )}
      </Sheet>

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Vault Import?"
        description="Your selected Vault namespace and secret paths will be lost."
      />
    </>
  );
};
