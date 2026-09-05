import { useMemo, useState } from "react";
import {
  ArrowDownIcon,
  ArrowRightIcon,
  CheckIcon,
  ClipboardCopyIcon,
  LockIcon
} from "lucide-react";

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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Label,
  SecretPathInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import {
  useGetOrCreateFolder,
  useListProjectEnvironmentsFolders
} from "@app/hooks/api/secretFolders/queries";
import { useDuplicateSecret } from "@app/hooks/api/secrets";

import type {
  CopySecretsAttributes,
  CopySecretsEnvironment,
  CopySecretsFolder,
  CopySecretsInvocation,
  CopySecretsMode,
  CopySecretsSource
} from "./copySecrets.types";
import {
  chunkCopySecretIds,
  getCopyDestinationFolderPaths,
  getCopyDestinationPath,
  getCopyFolderCreationSteps,
  getCopyPathName,
  getCopySecretConflicts,
  getInitialCopyState,
  getInvocationCopySelection,
  getRelativeCopyPath,
  groupCopySecretsRequests,
  isCopyingToSameLocation,
  isCopySecretSelectable,
  joinCopyPath,
  normalizeCopyPath
} from "./copySecrets.utils";
import { CopySecretsProperties } from "./CopySecretsProperties";
import { CopySecretsSecretTree } from "./CopySecretsSecretTree";
import { useCopySecretsQuery } from "./useCopySecretsQuery";

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

const CopySecretsSession = ({
  projectId,
  isOpen,
  invocation,
  environments,
  onOpenChange,
  onCompleted
}: Props & { invocation: CopySecretsInvocation }) => {
  const initialState = getInitialCopyState(invocation, environments);
  const [sourceEnvironmentSlug, setSourceEnvironmentSlug] = useState(
    initialState.sourceEnvironmentSlug
  );
  const [sourcePath, setSourcePath] = useState(initialState.sourcePath);
  const [destinationEnvironmentSlug, setDestinationEnvironmentSlug] = useState(
    initialState.destinationEnvironmentSlug
  );
  const [destinationPath, setDestinationPath] = useState(initialState.destinationPath);
  // Null keeps invocation selection pending until the current source has loaded.
  const [selection, setSelection] = useState<{ secretIds: string[]; folderPaths: string[] } | null>(
    null
  );
  const [attributes, setAttributes] = useState<CopySecretsAttributes>({
    value: true,
    comment: true,
    tags: true,
    metadata: true,
    skipMultilineEncoding: true
  });
  const includeValues = attributes.value;
  const [mode, setMode] = useState<CopySecretsMode>(initialState.mode);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [debouncedSourcePath] = useDebounce(sourcePath, 250);
  const [debouncedDestinationPath] = useDebounce(destinationPath, 250);
  const normalizedSourcePath = normalizeCopyPath(sourcePath);
  const normalizedDestinationPath = normalizeCopyPath(destinationPath);
  const foldersQuery = useListProjectEnvironmentsFolders(projectId, {
    enabled: isOpen,
    staleTime: 0
  });
  const sourceFolders = (foldersQuery.data?.[sourceEnvironmentSlug]?.folders ?? [])
    .filter(({ path }) => getRelativeCopyPath(path, normalizedSourcePath) !== null)
    .map(({ path }) => ({ path: normalizeCopyPath(path) }));
  const destinationFolders = (foldersQuery.data?.[destinationEnvironmentSlug]?.folders ?? [])
    .filter(({ path }) => getRelativeCopyPath(path, normalizedDestinationPath) !== null)
    .map(({ path }) => ({ path: normalizeCopyPath(path) }));
  const isSourcePathSettled = normalizedSourcePath === normalizeCopyPath(debouncedSourcePath);
  const isDestinationPathSettled =
    normalizedDestinationPath === normalizeCopyPath(debouncedDestinationPath);
  const sourceQuery = useCopySecretsQuery({
    projectId,
    environment: sourceEnvironmentSlug,
    secretPath: normalizedSourcePath,
    enabled: isOpen && foldersQuery.isSuccess && isSourcePathSettled
  });
  const destinationQuery = useCopySecretsQuery({
    projectId,
    environment: destinationEnvironmentSlug,
    secretPath: normalizedDestinationPath,
    enabled: isOpen && foldersQuery.isSuccess && isDestinationPathSettled
  });
  const sourceSecrets = useMemo(
    () => (sourceQuery.data ?? []).filter(isCopySecretSelectable),
    [sourceQuery.data]
  );
  const invocationSelection = getInvocationCopySelection({
    invocation,
    sourcePath: normalizedSourcePath,
    secrets: sourceSecrets,
    folders: sourceFolders
  });
  const currentSelection = selection ?? invocationSelection;
  const selectedSecrets = sourceSecrets.filter(({ id }) => currentSelection.secretIds.includes(id));
  const selectedIds = selectedSecrets.map(({ id }) => id);
  const selectedFolderPaths = sourceFolders
    .filter(({ path }) => path !== "/" && currentSelection.folderPaths.includes(path))
    .map(({ path }) => path);
  const sourceEnvironment = environments.find(({ slug }) => slug === sourceEnvironmentSlug) ?? null;
  const destinationEnvironment =
    environments.find(({ slug }) => slug === destinationEnvironmentSlug) ?? null;
  const sourceFolderName = getCopyPathName(normalizedSourcePath);
  const effectiveMode = sourceFolderName ? mode : "contents";
  const requestGroups = groupCopySecretsRequests({
    secrets: selectedSecrets,
    sourceRootPath: normalizedSourcePath,
    destinationRootPath: normalizedDestinationPath,
    mode: effectiveMode,
    includeValues
  });
  const destinationFolderPaths = getCopyDestinationFolderPaths({
    folderPaths: selectedFolderPaths,
    sourceRootPath: normalizedSourcePath,
    destinationRootPath: normalizedDestinationPath,
    mode: effectiveMode
  });
  const previewFolders: CopySecretsFolder[] = [...destinationFolders];
  const existingFolderPaths = new Set(destinationFolders.map(({ path }) => path));
  [...destinationFolderPaths, ...requestGroups.map((group) => group.destinationPath)]
    .flatMap(getCopyFolderCreationSteps)
    .forEach(({ parentPath, name }) => {
      const path = joinCopyPath(parentPath, name);
      if (!existingFolderPaths.has(path)) {
        previewFolders.push({ path, previewStatus: "new" });
        existingFolderPaths.add(path);
      }
    });
  const isSourceLoading =
    !isSourcePathSettled ||
    foldersQuery.isPending ||
    foldersQuery.isFetching ||
    sourceQuery.isPending ||
    sourceQuery.isFetching;
  const isSourceError = sourceQuery.isError || foldersQuery.isError;
  const isDestinationLoading =
    !isDestinationPathSettled ||
    foldersQuery.isPending ||
    foldersQuery.isFetching ||
    destinationQuery.isPending ||
    destinationQuery.isFetching;
  const unavailableValueCount = includeValues
    ? selectedSecrets.filter(({ isValueHidden }) => isValueHidden).length
    : 0;
  const selectedItemCount = selectedIds.length + selectedFolderPaths.length;
  const selectionLabel = selectedFolderPaths.length
    ? `${selectedIds.length} secrets and ${selectedFolderPaths.length} folders`
    : `${selectedIds.length} ${selectedIds.length === 1 ? "secret" : "secrets"}`;
  let bulkSelectionSummary: string | undefined;
  if (invocation.origin === "bulk") {
    const count = invocation.selectedSecretCount + invocation.folderNames.length;
    const availableSecretCount = sourceSecrets.filter(
      ({ name, path }) =>
        normalizeCopyPath(path) === normalizedSourcePath &&
        Object.values(invocation.secretsByEnvironment)
          .flat()
          .some((secret) => secret.name === name)
    ).length;
    const availableFolderCount = invocation.folderNames.filter((name) =>
      sourceFolders.some(({ path }) => path === joinCopyPath(normalizedSourcePath, name))
    ).length;
    if (!sourceEnvironment) {
      bulkSelectionSummary = `${count} selected items. Choose a source environment to confirm availability.`;
    } else if (isSourceLoading && !isSourceError) {
      bulkSelectionSummary = "Checking selected items in this source…";
    } else {
      bulkSelectionSummary = `${availableSecretCount + availableFolderCount} of ${count} originally selected items are available in ${sourceEnvironment.name} at ${normalizedSourcePath}. Unavailable items won’t be copied.`;
    }
  }
  const destinationContents = useMemo<CopySecretsSource[]>(() => {
    const contents: CopySecretsSource[] = (destinationQuery.data ?? []).map((secret) => ({
      ...secret
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
        existing.isValueHidden = secret.isValueHidden;
        return;
      }
      const incoming = {
        id: `incoming-${secret.id}`,
        name: secret.name,
        isValueHidden: secret.isValueHidden,
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
    destinationSecrets: destinationQuery.data ?? [],
    requestGroups
  });
  const hasDestinationConflicts = !isDestinationLoading && conflictingSecrets.length > 0;
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
    if (isSourceError) return "Source secrets couldn't be loaded";
    if (isSourceLoading) return "Loading source secrets";
    if (isDestinationLoading) return "Loading destination secrets";
    if (!selectedItemCount) return "Select at least one secret or folder";
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
        ...new Set([
          ...destinationFolderPaths,
          ...copyRequestGroups.map(({ destinationPath: path }) => path)
        ])
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
                ...attributes,
                value: group.includeValues
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
      if (selectedFolderPaths.length > 0) {
        notificationText += `; ${selectedFolderPaths.length} ${selectedFolderPaths.length === 1 ? "folder" : "folders"} copied`;
      }
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
        type:
          approvalCount > 0 || (!copiedSecretIds.length && !selectedFolderPaths.length)
            ? "info"
            : "success",
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

  const handleSubmit = async () => {
    if (disabledReason || isSubmitting) return;

    if (conflictingSecrets.length > 0) {
      setIsConflictDialogOpen(true);
      return;
    }

    await copySecrets({ shouldOverwrite: false });
  };

  const handleConflictResolution = async (resolution: "override" | "skip") => {
    if (disabledReason || isSubmitting) return;
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
      folders={sourceFolders}
      selectedFolderPaths={selectedFolderPaths}
      sourcePath={normalizedSourcePath}
      selectedIds={selectedIds}
      isDisabled={isSubmitting}
      includeValues={includeValues}
      onSelectionChange={(secretIds, folderPaths) => setSelection({ secretIds, folderPaths })}
    />
  );
  if (!sourceEnvironmentSlug) {
    sourceContent = (
      <Empty className="h-full border">
        <EmptyHeader>
          <EmptyTitle>Choose a source environment</EmptyTitle>
          <EmptyDescription>Select an environment to browse its secrets.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else if (isSourceLoading && !isSourceError) {
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
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => {
              foldersQuery.refetch();
              sourceQuery.refetch();
            }}
          >
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  let destinationContent = (
    <CopySecretsSecretTree
      secrets={destinationContents}
      folders={previewFolders}
      sourcePath={normalizedDestinationPath}
      selectedIds={[]}
      isReadOnly
      showChangesFilter
      idPrefix="copy-secrets-destination"
      onSelectionChange={() => undefined}
    />
  );
  if (!destinationEnvironmentSlug) {
    destinationContent = (
      <Empty className="h-full border">
        <EmptyHeader>
          <EmptyTitle>Choose a destination environment</EmptyTitle>
          <EmptyDescription>Select an environment to preview the copy.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else if (isDestinationLoading) {
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
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => event.preventDefault()}
          >
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                Copy Secrets
                <DocumentationLinkBadge href={DOCUMENTATION_URL} />
              </SheetTitle>
              <SheetDescription>
                Perform a one-time copy of secrets between project locations.
              </SheetDescription>
            </SheetHeader>

            <div className="@container/copy-sheet flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
              <div className="grid min-h-0 flex-1 gap-4 @xl/copy-sheet:grid-cols-[minmax(0,1fr)_1rem_minmax(0,1fr)] @xl/copy-sheet:grid-rows-[auto_minmax(0,1fr)] @xl/copy-sheet:gap-x-2 @xl/copy-sheet:gap-y-3">
                <section
                  className="flex min-h-0 min-w-0 flex-col gap-3 @xl/copy-sheet:col-start-1 @xl/copy-sheet:row-span-2 @xl/copy-sheet:row-start-1 @xl/copy-sheet:grid @xl/copy-sheet:grid-rows-subgrid"
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
                          isDisabled={isSubmitting}
                          placeholder="Environment..."
                          searchPlaceholder="Search environments..."
                          searchAriaLabel="Search source environments"
                          getOptionLabel={({ name }) => name}
                          getOptionValue={({ slug }) => slug}
                          renderOptionIndicator={
                            invocation.origin === "bulk" &&
                            normalizedSourcePath === normalizeCopyPath(invocation.sourcePath)
                              ? ({ slug }, { isSelected }) => (
                                  <span className="flex items-center gap-2">
                                    <span className="flex size-4 items-center justify-center">
                                      {isSelected && <CheckIcon className="size-4" />}
                                    </span>
                                    <span className="text-xs text-muted">
                                      {`${(invocation.secretsByEnvironment[slug]?.length ?? 0) + (invocation.foldersByEnvironment[slug]?.length ?? 0)}/${invocation.selectedSecretCount + invocation.folderNames.length}`}
                                    </span>
                                  </span>
                                )
                              : undefined
                          }
                          onValueChange={(environment) => {
                            setSourceEnvironmentSlug(environment.slug);
                            setSelection(null);
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
                          disabled={isSubmitting}
                          onChange={(path) => {
                            setSourcePath(path);
                            setSelection(null);
                            if (!getCopyPathName(path)) setMode("contents");
                          }}
                        />
                      </Field>
                    </div>
                    {bulkSelectionSummary && (
                      <FieldDescription isOpen aria-live="polite">
                        {bulkSelectionSummary}
                      </FieldDescription>
                    )}
                  </div>
                  <div className="min-h-0 flex-1">{sourceContent}</div>
                </section>
                <div
                  className="flex items-center justify-center text-muted @xl/copy-sheet:col-start-2 @xl/copy-sheet:row-start-2"
                  aria-hidden
                >
                  <ArrowDownIcon className="size-4 @xl/copy-sheet:hidden" />
                  <ArrowRightIcon className="hidden size-4 @xl/copy-sheet:block" />
                </div>
                <section
                  className="flex min-h-0 min-w-0 flex-col gap-3 @xl/copy-sheet:col-start-3 @xl/copy-sheet:row-span-2 @xl/copy-sheet:row-start-1 @xl/copy-sheet:grid @xl/copy-sheet:grid-rows-subgrid"
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
                    {hasDestinationConflicts && (
                      <p className="text-xs text-muted" aria-live="polite">
                        Choose whether to overwrite or skip conflicting keys when you copy.
                      </p>
                    )}
                  </div>
                  <div className="min-h-0 flex-1">{destinationContent}</div>
                </section>
              </div>

              <p className="text-xs text-muted">
                Copies shared secrets and selected folders, including empty folders. Managed
                secrets, dynamic secrets, and imports are excluded.
              </p>
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
                      Include {sourceFolderName}/
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={mode === "contents" ? "neutral" : "outline"}
                      aria-pressed={mode === "contents"}
                      isDisabled={isSubmitting}
                      onClick={() => setMode("contents")}
                    >
                      Selected contents only
                    </Button>
                  </ButtonGroup>
                  <span className="font-mono text-xs text-muted">
                    {normalizedSourcePath} →{" "}
                    {getCopyDestinationPath({
                      sourcePath: normalizedSourcePath,
                      sourceRootPath: normalizedSourcePath,
                      destinationRootPath: normalizedDestinationPath,
                      mode: effectiveMode
                    })}
                  </span>
                </div>
              )}
            </div>

            <SheetFooter className="flex-wrap items-center border-t">
              <div className="mr-auto flex min-w-0 flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id="copy-secrets-values"
                    variant="project"
                    checked={includeValues}
                    disabled={isSubmitting}
                    onCheckedChange={(value) => setAttributes((current) => ({ ...current, value }))}
                  />
                  <Label htmlFor="copy-secrets-values">
                    <LockIcon className="size-4" aria-hidden /> Include secret values
                  </Label>
                </div>
                <CopySecretsProperties
                  attributes={attributes}
                  onChange={setAttributes}
                  isDisabled={isSubmitting}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                isDisabled={isSubmitting}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Tooltip open={disabledReason ? undefined : false}>
                <TooltipTrigger asChild>
                  <span className="inline-flex" aria-label={disabledReason}>
                    <Button
                      type="button"
                      onClick={handleSubmit}
                      variant="project"
                      isDisabled={Boolean(disabledReason)}
                      isPending={isSubmitting}
                    >
                      <ClipboardCopyIcon /> Copy{" "}
                      {selectedFolderPaths.length ? `${selectedItemCount} items` : selectionLabel}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{disabledReason}</TooltipContent>
              </Tooltip>
              {(unavailableValueCount > 0 || disabledReason) && (
                <p className="w-full text-xs text-muted" aria-live="polite">
                  {disabledReason && `${disabledReason}. `}
                  {unavailableValueCount > 0 &&
                    `${unavailableValueCount} selected ${unavailableValueCount === 1 ? "key has" : "keys have"} no value access and will be copied without values. Existing destination values are preserved. `}
                </p>
              )}
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

// Mount a fresh session for each entry point; don't synchronize invocation and selection in competing effects.
export const CopySecretsSheet = ({ invocation, isOpen, ...props }: Props) =>
  invocation && isOpen ? (
    <CopySecretsSession
      key={JSON.stringify(invocation)}
      {...props}
      invocation={invocation}
      isOpen={isOpen}
    />
  ) : null;
