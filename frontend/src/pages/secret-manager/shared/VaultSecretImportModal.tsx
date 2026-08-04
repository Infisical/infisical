import { useEffect, useRef, useState } from "react";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";

import {
  defaultVaultConnectionId,
  VaultConnectionAndNamespaceFields
} from "@app/components/external-migrations";
import { createNotification } from "@app/components/notifications";
import {
  Badge,
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
import { Alert, AlertDescription, AlertTitle } from "@app/components/v3/generic/Alert";
import { useBadgeOverflow } from "@app/components/v3/generic/DataGrid/hooks/use-badge-overflow";
import { FilterableSelect } from "@app/components/v3/generic/ReactSelect";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import { useGetVaultMounts, useGetVaultSecretPaths } from "@app/hooks/api/migration/queries";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  environment: string;
  secretPath: string;
  appConnections: TAvailableAppConnection[];
  onImport: (vaultPaths: string[], namespace: string, connectionId: string) => void;
};

type ContentProps = {
  onClose: () => void;
  environment: string;
  secretPath: string;
  appConnections: TAvailableAppConnection[];
  onImport: (vaultPaths: string[], namespace: string, connectionId: string) => void;
};

// Cap the rendered path length so every badge stays a predictable size. Longer
// paths are truncated from the start with a leading ellipsis so the meaningful
// tail (including the wildcard `+`) stays visible.
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

const Content = ({ onClose, environment, secretPath, appConnections, onImport }: ContentProps) => {
  const hasAppConnections = appConnections.length > 0;
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(
    defaultVaultConnectionId(appConnections)
  );
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
  const [selectedMountPath, setSelectedMountPath] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [shouldFetchPaths, setShouldFetchPaths] = useState(false);
  const [shouldFetchMounts, setShouldFetchMounts] = useState(false);

  const activeConnectionId = hasAppConnections ? (selectedConnectionId ?? undefined) : undefined;

  const { data: vaultSecretPaths, isLoading: isLoadingPaths } = useGetVaultSecretPaths(
    shouldFetchPaths,
    selectedNamespace ?? undefined,
    selectedMountPath ?? undefined,
    activeConnectionId
  );
  const secretPaths = vaultSecretPaths?.secretPaths;
  const skippedWildcardPaths = vaultSecretPaths?.skippedWildcardPaths ?? [];
  const { data: mounts, isLoading: isLoadingMounts } = useGetVaultMounts(
    shouldFetchMounts,
    selectedNamespace ?? undefined,
    activeConnectionId
  );

  const kvMounts = mounts?.filter((mount) => mount.type === "kv" || mount.type.startsWith("kv"));

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

  const handleConnectionChange = (id: string) => {
    setSelectedConnectionId(id);
    setSelectedNamespace(null);
    setSelectedMountPath(null);
    setSelectedPaths([]);
    setShouldFetchMounts(false);
    setShouldFetchPaths(false);
  };

  const handleNamespaceChange = (ns: string) => {
    setSelectedNamespace(ns);
    setSelectedMountPath(null);
    setSelectedPaths([]);
  };

  useEffect(() => {
    if (selectedNamespace) {
      setShouldFetchMounts(true);
    }
  }, [selectedNamespace]);

  useEffect(() => {
    if (selectedNamespace && selectedMountPath) {
      setShouldFetchPaths(true);
    } else {
      setShouldFetchPaths(false);
    }
  }, [selectedNamespace, selectedMountPath]);

  const handleImport = () => {
    if (!selectedPaths.length) {
      createNotification({
        type: "error",
        text: "Please select at least one Vault secret path to import"
      });
      return;
    }

    if (!selectedConnectionId) {
      createNotification({ type: "error", text: "Please select an app connection" });
      return;
    }

    if (!selectedNamespace) {
      createNotification({ type: "error", text: "Please select a namespace" });
      return;
    }

    if (!mounts || mounts.length === 0) {
      createNotification({
        type: "error",
        text: "No Vault mounts found. Please ensure you have KV secret engines configured."
      });
      return;
    }

    onImport(selectedPaths, selectedNamespace, selectedConnectionId);
    onClose();
  };

  return (
    <>
      <div className="mb-4 flex items-start gap-3 rounded-md border border-project/20 bg-project/5 p-3 text-sm text-project">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-medium text-foreground">Import Secrets from HashiCorp Vault</p>
          <p className="mt-1 text-xs leading-relaxed text-foreground/75">
            Select a Vault namespace and one or more secret paths to import secrets into the current
            Infisical environment (<code className="text-xs">{environment}</code>) at path{" "}
            <code className="text-xs">{secretPath}</code>.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <VaultConnectionAndNamespaceFields
          appConnections={appConnections}
          connectionId={selectedConnectionId}
          onConnectionIdChange={handleConnectionChange}
          namespace={selectedNamespace}
          onNamespaceChange={handleNamespaceChange}
          namespaceTooltip="Select the Vault namespace containing the secrets you want to import."
          namespaceHelpText="Select the Vault namespace to fetch available mounts"
        />

        <Field>
          <FieldLabel>
            Secrets Engine
            <Tooltip>
              <TooltipTrigger>
                <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64">
                Select the KV secrets engine to narrow down secret paths.
              </TooltipContent>
            </Tooltip>
          </FieldLabel>
          <FieldContent>
            <FilterableSelect
              value={kvMounts?.find((mount) => mount.path === selectedMountPath) ?? null}
              onChange={(value) => {
                const mount = Array.isArray(value) ? value[0] : value;
                if (mount) {
                  setSelectedMountPath(mount.path.replace(/\/$/, ""));
                  setSelectedPaths([]);
                }
              }}
              options={kvMounts || []}
              getOptionValue={(option) => option.path}
              getOptionLabel={(option) => option.path.replace(/\/$/, "")}
              isDisabled={isLoadingMounts || !kvMounts?.length}
              placeholder="Select secrets engine..."
            />
          </FieldContent>
          <FieldDescription>Choose a KV secrets engine to filter available secret paths</FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Vault Secret Path</FieldLabel>
          <FieldContent>
            <FilterableSelect
              isMulti
              value={selectedPaths.map((path) => ({ path }))}
              onChange={(value) => {
                if (!value) {
                  setSelectedPaths([]);
                } else if (Array.isArray(value)) {
                  setSelectedPaths(value.map((option) => option.path));
                }
              }}
              options={(secretPaths || []).map((path) => ({ path }))}
              getOptionValue={(option) => option.path}
              getOptionLabel={(option) => option.path}
              isDisabled={isLoadingPaths || !secretPaths?.length || !selectedMountPath}
              placeholder={
                !selectedMountPath
                  ? "Select a mount path first..."
                  : "Select Vault path(s) to import..."
              }
              isClearable
            />
          </FieldContent>
          <FieldDescription>
            Choose one or more secret paths from the selected mount to import into Infisical
          </FieldDescription>
        </Field>
      </div>

      {skippedWildcardPaths.length > 0 && (
        <Alert variant="warning" className="mt-4">
          <TriangleAlertIcon />
          <AlertTitle>
            {skippedWildcardPaths.length} secret path
            {skippedWildcardPaths.length > 1 ? "s are" : " is"} unavailable
          </AlertTitle>
          <AlertDescription>
            <p>
              {skippedWildcardPaths.length} secret path
              {skippedWildcardPaths.length > 1 ? "s are" : " is"} not available for selection. Vault
              imports don&apos;t support wildcard (<code className="text-warning">+</code>) paths. In
              Vault, update the policy on the App role or token behind this App Connection to grant
              access to absolute paths instead.
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
                    <Badge variant="warning" className="cursor-default font-mono">
                      +{hiddenCount} more
                    </Badge>
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
          isDisabled={!selectedPaths.length || isLoadingMounts || isLoadingPaths}
        >
          Import Secrets
        </Button>
      </DialogFooter>
    </>
  );
};

export const VaultSecretImportModal = ({
  isOpen,
  onOpenChange,
  environment,
  secretPath,
  appConnections,
  onImport
}: Props) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-visible" showCloseButton>
        <DialogHeader>
          <DialogTitle>Import from HashiCorp Vault</DialogTitle>
          <DialogDescription>
            Select a Vault namespace and one or more secret paths to import secrets into the current
            environment and folder.
          </DialogDescription>
        </DialogHeader>
        {isOpen && (
          <Content
            onClose={() => onOpenChange(false)}
            environment={environment}
            secretPath={secretPath}
            appConnections={appConnections}
            onImport={onImport}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
