import { FormEvent, useEffect, useMemo, useState } from "react";
import { ClipboardCopyIcon, LockIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Button,
  ButtonGroup,
  Combobox,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  SecretPathInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Switch
} from "@app/components/v3";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { useDebounce } from "@app/hooks";
import { useGetAccessibleSecrets } from "@app/hooks/api/dashboard";
import { useGetOrCreateFolder } from "@app/hooks/api/secretFolders";
import { useDuplicateSecret } from "@app/hooks/api/secrets";

import type {
  CopySecretsEnvironment,
  CopySecretsInvocation,
  CopySecretsMode,
  CopySecretsSource
} from "./copySecrets.types";
import {
  chunkCopySecretIds,
  getCopyFolderCreationSteps,
  getCopyPathName,
  getCopySecretConflicts,
  getOtherCopyEnvironmentSlug,
  groupCopySecretsRequests,
  isCopyingToSameLocation,
  isCopySecretSelectable,
  joinCopyPath,
  normalizeCopyPath
} from "./copySecrets.utils";
import { CopySecretsSecretTree } from "./CopySecretsSecretTree";

type Props = {
  projectId: string;
  isOpen: boolean;
  invocation: CopySecretsInvocation | null;
  environments: CopySecretsEnvironment[];
  onOpenChange: (isOpen: boolean) => void;
  onCompleted?: (copiedSecretIds: string[]) => void;
};

const DOCUMENTATION_URL =
  "https://infisical.com/docs/documentation/platform/folder#replicating-folder-contents";

const getInitialState = (
  invocation: CopySecretsInvocation,
  environments: CopySecretsEnvironment[]
) => {
  if (invocation.origin === "toolbar") {
    return {
      sourceEnvironmentSlug: getOtherCopyEnvironmentSlug(
        environments,
        invocation.destinationEnvironmentSlug
      ),
      sourcePath: "/",
      destinationEnvironmentSlug: invocation.destinationEnvironmentSlug,
      destinationPath: invocation.destinationPath,
      selectedIds: [] as string[],
      includeValues: true,
      mode: "contents" as CopySecretsMode
    };
  }

  return {
    sourceEnvironmentSlug: invocation.sourceEnvironmentSlug,
    sourcePath: invocation.sourcePath,
    destinationEnvironmentSlug: getOtherCopyEnvironmentSlug(
      environments,
      invocation.sourceEnvironmentSlug
    ),
    destinationPath: "/",
    selectedIds: invocation.secrets.map(({ id }) => id),
    includeValues: invocation.secrets.every(({ isValueHidden }) => !isValueHidden),
    mode: getCopyPathName(invocation.sourcePath) ? ("folder" as const) : ("contents" as const)
  };
};

export const CopySecretsSheet = ({
  projectId,
  isOpen,
  invocation,
  environments,
  onOpenChange,
  onCompleted
}: Props) => {
  const fallbackInvocation: CopySecretsInvocation = invocation ?? {
    origin: "toolbar",
    destinationEnvironmentSlug: "",
    destinationPath: "/"
  };
  const initialState = getInitialState(fallbackInvocation, environments);
  const [sourceEnvironmentSlug, setSourceEnvironmentSlug] = useState(
    initialState.sourceEnvironmentSlug
  );
  const [sourcePath, setSourcePath] = useState(initialState.sourcePath);
  const [destinationEnvironmentSlug, setDestinationEnvironmentSlug] = useState(
    initialState.destinationEnvironmentSlug
  );
  const [destinationPath, setDestinationPath] = useState(initialState.destinationPath);
  const [selectedIds, setSelectedIds] = useState(initialState.selectedIds);
  const [includeValues, setIncludeValues] = useState(initialState.includeValues);
  const [mode, setMode] = useState<CopySecretsMode>(initialState.mode);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [debouncedSourcePath] = useDebounce(sourcePath, 250);
  const [debouncedDestinationPath] = useDebounce(destinationPath, 250);
  const invocationKey = JSON.stringify(invocation);
  const isSourceLocked = invocation?.origin === "row" || invocation?.origin === "bulk";

  useEffect(() => {
    if (!isOpen || !invocation) return;
    const next = getInitialState(invocation, environments);
    setSourceEnvironmentSlug(next.sourceEnvironmentSlug);
    setSourcePath(next.sourcePath);
    setDestinationEnvironmentSlug(next.destinationEnvironmentSlug);
    setDestinationPath(next.destinationPath);
    setSelectedIds(next.selectedIds);
    setIncludeValues(next.includeValues);
    setMode(next.mode);
    setIsConflictDialogOpen(false);
  }, [environments, invocationKey, isOpen]);

  const sourceQuery = useGetAccessibleSecrets({
    projectId,
    environment: sourceEnvironmentSlug,
    secretPath: normalizeCopyPath(debouncedSourcePath),
    recursive: true,
    filterByAction: ProjectPermissionSecretActions.DescribeSecret,
    options: {
      enabled:
        isOpen &&
        !isSourceLocked &&
        Boolean(projectId && sourceEnvironmentSlug && debouncedSourcePath)
    }
  });

  const sourceSecrets = useMemo<CopySecretsSource[]>(() => {
    if (invocation?.origin === "row" || invocation?.origin === "bulk") return invocation.secrets;
    return (sourceQuery.data ?? []).map((secret) => ({
      id: secret.id,
      name: secret.secretKey,
      path: secret.secretPath,
      isValueHidden: secret.secretValueHidden,
      isRotated: secret.isRotatedSecret,
      isHoneyToken: secret.isHoneyTokenSecret
    }));
  }, [invocation, isSourceLocked, sourceQuery.data]);

  const destinationQuery = useGetAccessibleSecrets({
    projectId,
    environment: destinationEnvironmentSlug,
    secretPath: normalizeCopyPath(debouncedDestinationPath),
    recursive: true,
    filterByAction: ProjectPermissionSecretActions.DescribeSecret,
    options: {
      enabled:
        isOpen && Boolean(projectId && destinationEnvironmentSlug && debouncedDestinationPath)
    }
  });

  useEffect(() => {
    const availableIds = new Set(
      sourceSecrets
        .filter((secret) => isCopySecretSelectable(secret, includeValues))
        .map(({ id }) => id)
    );
    setSelectedIds((current) => {
      const next = current.filter((id) => availableIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [includeValues, sourceSecrets]);

  const sourceEnvironment = environments.find(({ slug }) => slug === sourceEnvironmentSlug) ?? null;
  const destinationEnvironment =
    environments.find(({ slug }) => slug === destinationEnvironmentSlug) ?? null;
  const selectedSecrets = sourceSecrets.filter(({ id }) => selectedIds.includes(id));
  const normalizedSourcePath = normalizeCopyPath(sourcePath);
  const normalizedDestinationPath = normalizeCopyPath(destinationPath);
  const sourceFolderName = getCopyPathName(normalizedSourcePath);
  const effectiveMode = sourceFolderName ? mode : "contents";
  const requestGroups = groupCopySecretsRequests({
    secrets: selectedSecrets,
    sourceRootPath: normalizedSourcePath,
    destinationRootPath: normalizedDestinationPath,
    mode: effectiveMode
  });
  const destinationContents = useMemo<CopySecretsSource[]>(() => {
    const contents: CopySecretsSource[] = (destinationQuery.data ?? []).map((secret) => ({
      id: secret.id,
      name: secret.secretKey,
      path: secret.secretPath
    }));
    const byLocation = new Map(
      contents.map((secret) => [`${normalizeCopyPath(secret.path)}\u0000${secret.name}`, secret])
    );
    const destinationPathBySourcePath = new Map(
      requestGroups.map((group) => [group.sourcePath, group.destinationPath])
    );

    selectedSecrets.forEach((secret) => {
      const path = destinationPathBySourcePath.get(normalizeCopyPath(secret.path));
      if (!path) return;
      const key = `${path}\u0000${secret.name}`;
      const existing = byLocation.get(key);
      if (existing) {
        existing.previewStatus = "conflict";
        return;
      }
      const incoming = {
        id: `incoming-${secret.id}`,
        name: secret.name,
        path,
        previewStatus: "new" as const
      };
      contents.push(incoming);
      byLocation.set(key, incoming);
    });

    return contents;
  }, [destinationQuery.data, requestGroups, selectedSecrets]);
  const conflictingSecrets = getCopySecretConflicts({
    secrets: selectedSecrets,
    destinationSecrets:
      destinationQuery.data?.map((secret) => ({
        id: secret.id,
        name: secret.secretKey,
        path: secret.secretPath
      })) ?? [],
    requestGroups
  });
  const isSourcePathSettled =
    normalizeCopyPath(sourcePath) === normalizeCopyPath(debouncedSourcePath);
  const isSourceLoading =
    !isSourceLocked && (!isSourcePathSettled || sourceQuery.isPending || sourceQuery.isFetching);
  const isSourceError = !isSourceLocked && sourceQuery.isError;
  const isDestinationPathSettled =
    normalizeCopyPath(destinationPath) === normalizeCopyPath(debouncedDestinationPath);
  const isDestinationLoading =
    !isDestinationPathSettled || destinationQuery.isPending || destinationQuery.isFetching;
  const cannotIncludeValues =
    isSourceLocked && sourceSecrets.some(({ isValueHidden }) => isValueHidden);

  const disabledReason = (() => {
    if (!sourceEnvironmentSlug || !destinationEnvironmentSlug)
      return "Choose source and destination environments";
    if (!normalizedSourcePath || !normalizedDestinationPath)
      return "Choose source and destination paths";
    if (
      isCopyingToSameLocation({
        sourceEnvironment: sourceEnvironmentSlug,
        destinationEnvironment: destinationEnvironmentSlug,
        sourcePath: normalizedSourcePath,
        destinationPath: normalizedDestinationPath,
        mode: effectiveMode
      })
    )
      return "Choose a different destination path";
    if (isSourceLoading) return "Loading source secrets";
    if (isSourceError) return "Source secrets couldn't be loaded";
    if (isDestinationLoading) return "Loading destination secrets";
    if (!selectedIds.length) return "Select at least one secret";
    return undefined;
  })();

  const duplicateSecret = useDuplicateSecret();
  const getOrCreateFolder = useGetOrCreateFolder();

  const copySecrets = async ({
    shouldOverwrite,
    skippedSecretIds = []
  }: {
    shouldOverwrite: boolean;
    skippedSecretIds?: string[];
  }) => {
    setIsSubmitting(true);
    try {
      const skippedIds = new Set(skippedSecretIds);
      const copiedSecretIds = selectedIds.filter((id) => !skippedIds.has(id));
      const copyRequestGroups = requestGroups
        .map((group) => ({
          ...group,
          secretIds: group.secretIds.filter((id) => !skippedIds.has(id))
        }))
        .filter(({ secretIds }) => secretIds.length > 0);
      const destinationPaths = [
        ...new Set(copyRequestGroups.map(({ destinationPath: path }) => path))
      ].sort((left, right) => left.split("/").length - right.split("/").length);
      const destinationFolderSteps = [
        ...new Map(
          destinationPaths
            .flatMap(getCopyFolderCreationSteps)
            .map((step) => [joinCopyPath(step.parentPath, step.name), step])
        ).values()
      ];
      await destinationFolderSteps.reduce(async (previous, { parentPath, name }) => {
        await previous;
        await getOrCreateFolder.mutateAsync({
          projectId,
          environment: destinationEnvironmentSlug,
          path: parentPath,
          name
        });
      }, Promise.resolve());

      const results = await copyRequestGroups.reduce<Promise<Array<{ approvalCount: number }>>>(
        async (previousResults, group) => {
          const accumulated = await previousResults;
          const groupResults = await chunkCopySecretIds(group.secretIds).reduce<
            Promise<Array<{ approvalCount: number }>>
          >(async (previousChunks, secretIds) => {
            const chunks = await previousChunks;
            const response = await duplicateSecret.mutateAsync({
              projectId,
              sourceEnvironment: sourceEnvironmentSlug,
              sourceSecretPath: group.sourcePath,
              destinationEnvironment: destinationEnvironmentSlug,
              destinationSecretPath: group.destinationPath,
              secretIds,
              shouldOverwrite,
              attributesToCopy: {
                value: includeValues,
                comment: true,
                tags: true,
                metadata: true,
                skipMultilineEncoding: true
              }
            });
            return [
              ...chunks,
              { approvalCount: response.results.filter((result) => "approval" in result).length }
            ];
          }, Promise.resolve([]));
          return [...accumulated, ...groupResults];
        },
        Promise.resolve([])
      );

      const approvalCount = results.reduce((count, result) => count + result.approvalCount, 0);
      const skippedCount = skippedSecretIds.length;
      let notificationText = `${copiedSecretIds.length} ${
        copiedSecretIds.length === 1 ? "secret" : "secrets"
      } copied`;
      if (approvalCount > 0) {
        notificationText = `${approvalCount} ${
          approvalCount === 1 ? "copy requires" : "copies require"
        } approval`;
      } else if (copiedSecretIds.length === 0 && skippedCount > 0) {
        notificationText = `${skippedCount} conflicting ${
          skippedCount === 1 ? "secret" : "secrets"
        } skipped`;
      }
      if (skippedCount > 0 && copiedSecretIds.length > 0) {
        notificationText += `; ${skippedCount} ${
          skippedCount === 1 ? "conflict" : "conflicts"
        } skipped`;
      }
      createNotification({
        type: approvalCount > 0 || copiedSecretIds.length === 0 ? "info" : "success",
        text: notificationText
      });
      onCompleted?.(copiedSecretIds);
      onOpenChange(false);
    } catch {
      // Mutation failures are surfaced by the global React Query error handler.
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabledReason || isSubmitting) return;

    if (conflictingSecrets.length > 0) {
      setIsConflictDialogOpen(true);
      return;
    }

    await copySecrets({ shouldOverwrite: false });
  };

  const handleConflictResolution = async (resolution: "override" | "skip") => {
    setIsConflictDialogOpen(false);
    await copySecrets({
      shouldOverwrite: resolution === "override",
      skippedSecretIds:
        resolution === "skip" ? conflictingSecrets.map(({ sourceSecretId }) => sourceSecretId) : []
    });
  };

  let sourceContent = (
    <CopySecretsSecretTree
      secrets={sourceSecrets}
      sourcePath={normalizedSourcePath}
      selectedIds={selectedIds}
      isDisabled={isSubmitting}
      includeValues={includeValues}
      onSelectionChange={setSelectedIds}
    />
  );
  if (isSourceLoading) {
    sourceContent = (
      <div
        className="flex h-full flex-col gap-3 rounded-md border border-border bg-container p-4"
        aria-label="Loading source secrets"
      >
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={`copy-secrets-skeleton-${index + 1}`} className="h-9 w-full" />
        ))}
      </div>
    );
  } else if (isSourceError) {
    sourceContent = (
      <Alert variant="danger" className="h-full content-center">
        <AlertTitle>Couldn&apos;t load secrets</AlertTitle>
        <AlertDescription>
          Check your source location and access, then try again.
          <Button type="button" size="xs" variant="outline" onClick={() => sourceQuery.refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  let destinationContent = (
    <CopySecretsSecretTree
      secrets={destinationContents}
      sourcePath={normalizedDestinationPath}
      selectedIds={[]}
      isReadOnly
      showChangesFilter
      idPrefix="copy-secrets-destination"
      onSelectionChange={() => undefined}
    />
  );
  if (isDestinationLoading) {
    destinationContent = (
      <div
        className="flex h-full flex-col gap-3 rounded-md border border-border bg-container p-4"
        aria-label="Loading destination secrets"
      >
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={`copy-destination-skeleton-${index + 1}`} className="h-9 w-full" />
        ))}
      </div>
    );
  } else if (destinationQuery.isError) {
    destinationContent = (
      <Alert variant="warning" className="h-full content-center">
        <AlertTitle>Destination contents unavailable</AlertTitle>
        <AlertDescription>
          You can still copy here, but existing secrets can&apos;t be previewed with your current
          access.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !isSubmitting && onOpenChange(open)}>
        <SheetContent className="w-full sm:w-3/4 sm:max-w-[1500px]">
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                Copy Secrets
                <DocumentationLinkBadge href={DOCUMENTATION_URL} />
              </SheetTitle>
              <SheetDescription>
                Copy secrets between project locations. This isn&apos;t a sync.
              </SheetDescription>
            </SheetHeader>

            <div className="@container/copy-sheet flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
              <div className="grid min-h-0 flex-1 gap-4 @xl/copy-sheet:grid-cols-2">
                <section
                  className="flex min-h-0 min-w-0 flex-col gap-3"
                  aria-labelledby="copy-source-contents-heading"
                >
                  <div className="flex flex-col gap-2">
                    <h3
                      id="copy-source-contents-heading"
                      className="text-sm font-medium text-foreground"
                    >
                      Source
                    </h3>
                    <div className="grid grid-cols-[minmax(8rem,0.8fr)_minmax(0,1.2fr)] gap-2">
                      <Field>
                        <FieldLabel htmlFor="copy-secrets-source-environment" className="sr-only">
                          Source environment
                        </FieldLabel>
                        <Combobox
                          id="copy-secrets-source-environment"
                          modal
                          value={sourceEnvironment}
                          options={environments}
                          isDisabled={isSubmitting || isSourceLocked}
                          placeholder="Environment..."
                          searchPlaceholder="Search environments..."
                          searchAriaLabel="Search source environments"
                          getOptionLabel={({ name }) => name}
                          getOptionValue={({ slug }) => slug}
                          onValueChange={(environment) => {
                            setSourceEnvironmentSlug(environment.slug);
                            setSelectedIds([]);
                          }}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="copy-secrets-source-path" className="sr-only">
                          Source path
                        </FieldLabel>
                        <SecretPathInput
                          id="copy-secrets-source-path"
                          projectId={projectId}
                          environment={sourceEnvironmentSlug}
                          value={sourcePath}
                          disabled={isSubmitting || isSourceLocked}
                          onChange={(path) => {
                            setSourcePath(path);
                            setSelectedIds([]);
                            if (!getCopyPathName(path)) setMode("contents");
                          }}
                        />
                      </Field>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1">{sourceContent}</div>
                </section>
                <section
                  className="flex min-h-0 min-w-0 flex-col gap-3"
                  aria-labelledby="copy-destination-contents-heading"
                >
                  <div className="flex flex-col gap-2">
                    <h3
                      id="copy-destination-contents-heading"
                      className="text-sm font-medium text-foreground"
                    >
                      Destination
                    </h3>
                    <div className="grid grid-cols-[minmax(8rem,0.8fr)_minmax(0,1.2fr)] gap-2">
                      <Field>
                        <FieldLabel
                          htmlFor="copy-secrets-destination-environment"
                          className="sr-only"
                        >
                          Destination environment
                        </FieldLabel>
                        <Combobox
                          id="copy-secrets-destination-environment"
                          modal
                          value={destinationEnvironment}
                          options={environments}
                          isDisabled={isSubmitting}
                          placeholder="Environment..."
                          searchPlaceholder="Search environments..."
                          searchAriaLabel="Search destination environments"
                          getOptionLabel={({ name }) => name}
                          getOptionValue={({ slug }) => slug}
                          onValueChange={(environment) =>
                            setDestinationEnvironmentSlug(environment.slug)
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="copy-secrets-destination-path" className="sr-only">
                          Destination path
                        </FieldLabel>
                        <SecretPathInput
                          id="copy-secrets-destination-path"
                          projectId={projectId}
                          environment={destinationEnvironmentSlug}
                          value={destinationPath}
                          disabled={isSubmitting}
                          onChange={setDestinationPath}
                        />
                      </Field>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1">{destinationContent}</div>
                </section>
              </div>

              {sourceFolderName && (
                <div className="flex flex-wrap items-center gap-3">
                  <ButtonGroup aria-label="Folder copy mode">
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "folder" ? "neutral" : "outline"}
                      aria-pressed={mode === "folder"}
                      isDisabled={isSubmitting}
                      onClick={() => setMode("folder")}
                    >
                      As folder {sourceFolderName}/
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "contents" ? "neutral" : "outline"}
                      aria-pressed={mode === "contents"}
                      isDisabled={isSubmitting}
                      onClick={() => setMode("contents")}
                    >
                      Contents only
                    </Button>
                  </ButtonGroup>
                  <span className="font-mono text-xs text-muted">
                    {normalizedSourcePath} →{" "}
                    {requestGroups[0]?.destinationPath ?? normalizedDestinationPath}
                  </span>
                </div>
              )}
            </div>

            <SheetFooter className="flex-wrap items-center border-t">
              <div className="mr-auto flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
                <Field
                  orientation="horizontal"
                  className="w-auto"
                  data-disabled={isSubmitting || cannotIncludeValues}
                >
                  <Switch
                    id="copy-secrets-values"
                    variant="project"
                    checked={includeValues}
                    disabled={isSubmitting || cannotIncludeValues}
                    aria-describedby="copy-secrets-values-description"
                    onCheckedChange={setIncludeValues}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="copy-secrets-values" className="cursor-pointer">
                      <LockIcon aria-hidden /> Include secret values
                    </FieldLabel>
                    <FieldDescription id="copy-secrets-values-description">
                      Enabling this deselects secrets marked No value access.
                    </FieldDescription>
                  </FieldContent>
                </Field>
                {disabledReason && <span className="text-xs text-muted">{disabledReason}</span>}
              </div>
              <Button
                type="button"
                variant="ghost"
                isDisabled={isSubmitting}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="project"
                isDisabled={Boolean(disabledReason)}
                isPending={isSubmitting}
              >
                <ClipboardCopyIcon /> Copy {selectedIds.length}{" "}
                {selectedIds.length === 1 ? "secret" : "secrets"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={isConflictDialogOpen} onOpenChange={setIsConflictDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resolve Secret Conflicts</AlertDialogTitle>
            <AlertDialogDescription>
              These secrets already exist at the destination. Override them or copy only secrets
              without conflicts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-64 overflow-y-auto rounded-md border border-border bg-container">
            {conflictingSecrets.map(
              ({ sourceSecretId, name, destinationPath: conflictDestinationPath }) => (
                <li
                  key={sourceSecretId}
                  className="flex min-w-0 flex-col gap-1 border-b border-border px-3 py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <span className="font-mono text-sm break-all text-foreground">{name}</span>
                  <span className="font-mono text-xs break-all text-muted">
                    {conflictDestinationPath}
                  </span>
                </li>
              )
            )}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="outline" onClick={() => handleConflictResolution("skip")}>
              Skip conflicts
            </AlertDialogAction>
            <AlertDialogAction
              variant="danger"
              onClick={() => handleConflictResolution("override")}
            >
              Override conflicts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
