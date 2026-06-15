import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";
import { z } from "zod";

import {
  defaultVaultConnectionId,
  VaultConnectionAndNamespaceFields
} from "@app/components/external-migrations";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useBadgeOverflow } from "@app/components/v3/generic/DataGrid/hooks/use-badge-overflow";
import { FilterableSelect } from "@app/components/v3/generic/ReactSelect";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import { useGetVaultMounts, useGetVaultSecretPaths } from "@app/hooks/api/migration/queries";

const schema = z.object({
  connectionId: z.string().min(1, "App connection is required"),
  namespace: z.string().min(1, "Namespace is required"),
  mountPath: z.string().min(1, "Secrets engine is required"),
  paths: z.array(z.string()).min(1, "Select at least one secret path")
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
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

export const VaultSecretImportModal = ({
  isOpen,
  onOpenChange,
  environment,
  secretPath,
  appConnections,
  onImport
}: Props) => {
  const hasAppConnections = appConnections.length > 0;

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      connectionId: defaultVaultConnectionId(appConnections) ?? "",
      namespace: "",
      mountPath: "",
      paths: []
    }
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        connectionId: defaultVaultConnectionId(appConnections) ?? "",
        namespace: "",
        mountPath: "",
        paths: []
      });
    }
  }, [isOpen, reset, appConnections]);

  const connectionId = watch("connectionId");
  const namespace = watch("namespace");
  const mountPath = watch("mountPath");
  const selectedPaths = watch("paths");

  const activeConnectionId = hasAppConnections ? connectionId || undefined : undefined;

  const { data: mounts, isLoading: isLoadingMounts } = useGetVaultMounts(
    Boolean(namespace),
    namespace || undefined,
    activeConnectionId
  );
  const { data: vaultSecretPaths, isLoading: isLoadingPaths } = useGetVaultSecretPaths(
    Boolean(namespace && mountPath),
    namespace || undefined,
    mountPath || undefined,
    activeConnectionId
  );

  const secretPaths = vaultSecretPaths?.secretPaths;
  const skippedWildcardPaths = vaultSecretPaths?.skippedWildcardPaths ?? [];

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
    setValue("connectionId", id, { shouldValidate: true });
    setValue("namespace", "");
    setValue("mountPath", "");
    setValue("paths", []);
  };

  const handleNamespaceChange = (ns: string) => {
    setValue("namespace", ns, { shouldValidate: true });
    setValue("mountPath", "");
    setValue("paths", []);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const onFormSubmit = (data: FormData) => {
    onImport(data.paths, data.namespace, data.connectionId);
    handleClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-2xl overflow-visible" showCloseButton>
        <DialogHeader>
          <DialogTitle>Import from HashiCorp Vault</DialogTitle>
          <DialogDescription>
            Select a Vault namespace and one or more secret paths to import secrets into the current
            environment and folder.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="project" className="mb-4">
          <InfoIcon />
          <AlertTitle>Import Secrets from HashiCorp Vault</AlertTitle>
          <AlertDescription>
            <p>
              Select a Vault namespace and one or more secret paths to import secrets into the
              current environment (<code className="text-xs">{environment}</code>) and folder (
              <code className="text-xs">{secretPath}</code>).
            </p>
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <VaultConnectionAndNamespaceFields
            appConnections={appConnections}
            connectionId={connectionId || null}
            onConnectionIdChange={handleConnectionChange}
            namespace={namespace || null}
            onNamespaceChange={handleNamespaceChange}
            namespaceTooltip="Select the Vault namespace containing the secrets you want to import."
            namespaceHelpText="Select the Vault namespace to fetch available mounts"
          />

          <Controller
            control={control}
            name="mountPath"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Secrets Engine</FieldLabel>
                <FieldContent>
                  <FilterableSelect
                    value={kvMounts?.find((mount) => mount.path === field.value) ?? null}
                    onChange={(value) => {
                      const single = Array.isArray(value) ? value[0] : value;
                      if (single && "path" in single) {
                        field.onChange(single.path.replace(/\/$/, "")); // Remove trailing slash
                        setValue("paths", []);
                      } else {
                        field.onChange("");
                      }
                    }}
                    options={kvMounts || []}
                    getOptionValue={(option) => option.path}
                    getOptionLabel={(option) => option.path.replace(/\/$/, "")}
                    isDisabled={isLoadingMounts || !kvMounts?.length}
                    placeholder="Select secrets engine..."
                  />
                </FieldContent>
                <FieldDescription>
                  Choose a KV secrets engine to filter available secret paths
                </FieldDescription>
                <FieldError errors={[error]} />
              </Field>
            )}
          />

          <Controller
            control={control}
            name="paths"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Vault Secret Path</FieldLabel>
                <FieldContent>
                  <FilterableSelect
                    isMulti
                    value={field.value.map((path) => ({ path }))}
                    onChange={(value) => {
                      if (Array.isArray(value)) {
                        field.onChange(value.map((option) => option.path));
                      } else {
                        field.onChange([]);
                      }
                    }}
                    options={(secretPaths || []).map((path) => ({ path }))}
                    getOptionValue={(option) => option.path}
                    getOptionLabel={(option) => option.path}
                    isDisabled={isLoadingPaths || !secretPaths?.length || !mountPath}
                    placeholder={
                      !mountPath
                        ? "Select a secrets engine first..."
                        : "Select Vault path(s) to import..."
                    }
                    isClearable
                  />
                </FieldContent>
                <FieldDescription>
                  Choose one or more secret paths from the selected mount to import into Infisical
                </FieldDescription>
                <FieldError errors={[error]} />
              </Field>
            )}
          />

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
                  <code className="text-yellow-500/80">+</code>) paths. In Vault, update the policy
                  on the App role or token behind this App Connection to grant access to absolute
                  paths instead.
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
                          <span>+{hiddenCount}</span>
                          <span className="text-foreground/80"> more</span>
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm p-2">
                        <div className="flex flex-col gap-1">
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

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="project"
              isPending={isSubmitting}
              isDisabled={
                isSubmitting || !selectedPaths.length || isLoadingMounts || isLoadingPaths
              }
            >
              Import Secrets
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
