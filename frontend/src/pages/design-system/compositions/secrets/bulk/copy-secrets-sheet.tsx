import { useState } from "react";
import { ArrowRightIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Combobox } from "@app/components/v4/ui/combobox";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Switch } from "@app/components/v4/ui/switch";
import { SmallText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import type {
  CopySecretsAttributes,
  CopySecretsFolder,
  CopySecretsInvocation,
  CopySecretsSource
} from "@app/pages/secret-manager/OverviewPage/components/CopySecretsSheet/copySecrets.types";
import {
  chunkCopySecretIds,
  type CopySecretsRequestGroup,
  getCopyDestinationFolderPaths,
  getCopySecretConflicts,
  getInitialCopyState,
  getInvocationCopySelection,
  getMissingCopyFolderCreationSteps,
  getRelativeCopyPath,
  groupCopySecretsRequests,
  isCopyingToSameLocation,
  isCopySecretSelectable,
  joinCopyPath,
  normalizeCopyPath
} from "@app/pages/secret-manager/OverviewPage/components/CopySecretsSheet/copySecrets.utils";

import { readableValue, type Resource, type Secret, versionsOf } from "../../secrets-model";
import { user } from "../../shared";
import { childPath, folderExists, Gate, LOCAL_ONLY } from "../flows/shared";
import type { OverlayHostProps } from "../row-actions/types";
import { CopySecretsProperties } from "./copy-secrets-properties";
import { CopySecretsTree, type PreviewFilter } from "./copy-secrets-tree";

import styles from "./copy-secrets.module.css";

export type { CopySecretsInvocation };

type Props = OverlayHostProps & { invocation?: CopySecretsInvocation; onCompleted?: () => void };

const DOCUMENTATION_URL =
  "https://infisical.com/docs/documentation/platform/folder#replicating-folder-contents";

const toSource = (secret: Secret): CopySecretsSource => ({
  id: secret.id,
  name: secret.name,
  path: secret.path,
  isValueHidden: secret.value.status === "unreadable",
  isRotated: Boolean(secret.managedBy),
  isHoneyToken: Boolean(secret.honeyToken)
});

const copyLocally = ({
  current,
  project,
  environment,
  folderSteps,
  requestGroups,
  attributes,
  shouldOverwrite
}: {
  current: Resource[];
  project: string;
  environment: string;
  folderSteps: { parentPath: string; name: string }[];
  requestGroups: CopySecretsRequestGroup[];
  attributes: CopySecretsAttributes;
  shouldOverwrite: boolean;
}) => {
  const next = [...current];
  const timestamp = new Date().toISOString();
  let changed = false;
  folderSteps.forEach(({ parentPath, name }) => {
    if (folderExists(next, project, environment, joinCopyPath(parentPath, name))) return;
    next.push({
      kind: "folder",
      project,
      environment,
      path: parentPath,
      name,
      description: "",
      id: `${project}:${environment}:${parentPath}:folder:${name}`,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    changed = true;
  });

  const chunks = requestGroups.flatMap((group) =>
    chunkCopySecretIds(group.secretIds).map((secretIds) => ({ ...group, secretIds }))
  );
  const error = chunks.reduce<string | undefined>((failure, chunk) => {
    if (failure) return failure;
    const sources = chunk.secretIds.flatMap((id) => {
      const source = next.find((resource) => resource.id === id);
      return source?.kind === "secret" ? [source] : [];
    });
    const findExisting = (name: string) =>
      next.findIndex(
        (resource) =>
          resource.kind === "secret" &&
          resource.project === project &&
          resource.environment === environment &&
          resource.path === chunk.destinationPath &&
          resource.name === name
      );
    const blocked = sources.flatMap((source) => {
      const existing = next[findExisting(source.name)];
      if (existing?.kind !== "secret") return [];
      if (!shouldOverwrite)
        return [
          `Secret with key '${source.name}' already exists at destination. Set shouldOverwrite to true to replace it.`
        ];
      if (existing.managedBy)
        return [
          `Cannot duplicate to '${chunk.destinationPath}' because the destination key '${source.name}' is managed by a secret rotation.`
        ];
      if (existing.honeyToken)
        return [
          `Cannot duplicate to '${chunk.destinationPath}' because the destination key '${source.name}' is a honey token secret.`
        ];
      return [];
    })[0];
    if (blocked) return blocked;

    sources.forEach((source) => {
      const index = findExisting(source.name);
      const existing = next[index];
      const sourceValue = chunk.includeValues ? readableValue(source) : undefined;
      if (existing?.kind === "secret") {
        const patched: Secret = {
          ...existing,
          ...(attributes.comment && source.comment ? { comment: source.comment } : {}),
          ...(attributes.tags ? { tags: [...source.tags] } : {}),
          ...(attributes.metadata
            ? { metadata: source.metadata.map((entry) => ({ ...entry })) }
            : {}),
          ...(attributes.skipMultilineEncoding
            ? { skipMultilineEncoding: Boolean(source.skipMultilineEncoding) }
            : {}),
          updatedAt: timestamp
        };
        if (sourceValue === undefined) {
          next[index] = patched;
          return;
        }
        const version = existing.version + 1;
        next[index] = {
          ...patched,
          value: { status: "present", value: sourceValue },
          version,
          versions: [
            {
              version,
              value: sourceValue,
              createdAt: timestamp,
              actor: user.name,
              actorType: "user"
            },
            ...versionsOf(existing)
          ]
        };
        return;
      }
      next.push({
        kind: "secret",
        project,
        environment,
        path: chunk.destinationPath,
        name: source.name,
        id: `${project}:${environment}:${chunk.destinationPath}:secret:${source.name}`,
        createdAt: timestamp,
        updatedAt: timestamp,
        value: { status: "present", value: sourceValue ?? "" },
        comment: attributes.comment ? source.comment : "",
        tags: attributes.tags ? [...source.tags] : [],
        metadata: attributes.metadata ? source.metadata.map((entry) => ({ ...entry })) : [],
        version: 1,
        ...(attributes.skipMultilineEncoding && source.skipMultilineEncoding
          ? { skipMultilineEncoding: true }
          : {})
      });
    });
    changed = changed || sources.length > 0;
    return undefined;
  }, undefined);

  return { next, error, changed };
};

function CopySecretsSession({
  invocation,
  scope,
  resources,
  onClose,
  onApply,
  onToast,
  onCompleted
}: Props & { invocation: CopySecretsInvocation }) {
  const { project } = scope;
  const environments = scope.environments.map(({ value, label }) => ({
    id: value,
    name: label,
    slug: value
  }));
  const initialState = getInitialCopyState(invocation, environments);
  const [sourceEnvironmentSlug, setSourceEnvironmentSlug] = useState(
    initialState.sourceEnvironmentSlug
  );
  const [sourcePath, setSourcePath] = useState(initialState.sourcePath);
  const [destinationEnvironmentSlug, setDestinationEnvironmentSlug] = useState(
    initialState.destinationEnvironmentSlug
  );
  const [destinationPath, setDestinationPath] = useState(initialState.destinationPath);
  const [destinationPreviewFilter, setDestinationPreviewFilter] =
    useState<PreviewFilter>("changes");
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
  const [shouldOverwrite, setShouldOverwrite] = useState(false);
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const normalizedSourcePath = normalizeCopyPath(sourcePath);
  const normalizedDestinationPath = normalizeCopyPath(destinationPath);
  const folderPathsIn = (environment: string) =>
    resources.flatMap((resource) =>
      resource.kind === "folder" &&
      resource.project === project &&
      resource.environment === environment
        ? [normalizeCopyPath(childPath(resource.path, resource.name))]
        : []
    );
  const secretsUnder = (environment: string, rootPath: string) =>
    resources.flatMap((resource) =>
      resource.kind === "secret" &&
      resource.project === project &&
      resource.environment === environment &&
      getRelativeCopyPath(resource.path, rootPath) !== null
        ? [toSource(resource)]
        : []
    );
  const sourceFolders = folderPathsIn(sourceEnvironmentSlug)
    .filter((path) => getRelativeCopyPath(path, normalizedSourcePath) !== null)
    .map((path) => ({ path }));
  const destinationFolderPathsAll = folderPathsIn(destinationEnvironmentSlug);
  const destinationFolders = destinationFolderPathsAll
    .filter((path) => getRelativeCopyPath(path, normalizedDestinationPath) !== null)
    .map((path) => ({ path }));
  const sourceSecrets = secretsUnder(sourceEnvironmentSlug, normalizedSourcePath);
  const destinationSecrets = secretsUnder(destinationEnvironmentSlug, normalizedDestinationPath);
  const invocationSelection = getInvocationCopySelection({
    invocation,
    sourcePath: normalizedSourcePath,
    secrets: sourceSecrets,
    folders: sourceFolders
  });
  const currentSelection = selection ?? invocationSelection;
  const selectedSecrets = sourceSecrets.filter(
    (secret) => isCopySecretSelectable(secret) && currentSelection.secretIds.includes(secret.id)
  );
  const selectedIds = selectedSecrets.map(({ id }) => id);
  const selectedFolderPaths = sourceFolders
    .filter(({ path }) => path !== "/" && currentSelection.folderPaths.includes(path))
    .map(({ path }) => path);
  const sourceEnvironment = environments.find(({ slug }) => slug === sourceEnvironmentSlug) ?? null;
  const requestGroups = groupCopySecretsRequests({
    secrets: selectedSecrets,
    sourceRootPath: normalizedSourcePath,
    destinationRootPath: normalizedDestinationPath,
    includeValues
  });
  const destinationFolderPaths = getCopyDestinationFolderPaths({
    folderPaths: selectedFolderPaths,
    sourceRootPath: normalizedSourcePath,
    destinationRootPath: normalizedDestinationPath
  });
  const destinationPaths = [
    ...new Set([
      ...destinationFolderPaths,
      ...requestGroups.map(({ destinationPath: path }) => path)
    ])
  ];
  const destinationFolderSteps = getMissingCopyFolderCreationSteps({
    paths: destinationPaths,
    existingFolderPaths: destinationFolderPathsAll
  });
  const previewFolders: CopySecretsFolder[] = [...destinationFolders];
  const existingFolderPaths = new Set(destinationFolders.map(({ path }) => path));
  destinationFolderSteps.forEach(({ parentPath, name }) => {
    const path = joinCopyPath(parentPath, name);
    if (!existingFolderPaths.has(path)) {
      previewFolders.push({ path, previewStatus: "new" });
      existingFolderPaths.add(path);
    }
  });
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
      (secret) =>
        isCopySecretSelectable(secret) &&
        normalizeCopyPath(secret.path) === normalizedSourcePath &&
        Object.values(invocation.secretsByEnvironment)
          .flat()
          .some(({ name }) => name === secret.name)
    ).length;
    const availableFolderCount = invocation.folderNames.filter((name) =>
      sourceFolders.some(({ path }) => path === joinCopyPath(normalizedSourcePath, name))
    ).length;
    if (!sourceEnvironment) {
      bulkSelectionSummary = `${count} selected items. Choose a source environment to confirm availability.`;
    } else if (availableSecretCount + availableFolderCount < count) {
      bulkSelectionSummary = `${availableSecretCount + availableFolderCount} of ${count} originally selected items are available in ${sourceEnvironment.name} at ${normalizedSourcePath}. Unavailable items won’t be copied.`;
    }
  }
  const destinationContents: CopySecretsSource[] = (() => {
    const contents: CopySecretsSource[] = destinationSecrets.map((secret) => ({ ...secret }));
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
        existing.previewStatus = shouldOverwrite ? "overwrite" : "conflict";
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
  })();
  const conflictingSecrets = getCopySecretConflicts({
    secrets: selectedSecrets,
    destinationSecrets,
    requestGroups
  });
  const hasDestinationConflicts = conflictingSecrets.length > 0;
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
        destinationPath: normalizedDestinationPath
      })
    )
      return "Choose a different destination path";
    if (!selectedItemCount) return "Select at least one secret or folder";
    return undefined;
  })();

  const copySecrets = ({
    shouldOverwrite: overwriteExisting,
    skippedSecretIds = []
  }: {
    shouldOverwrite: boolean;
    skippedSecretIds?: string[];
  }) => {
    const skippedIds = new Set(skippedSecretIds);
    const copiedSecretIds = selectedIds.filter((id) => !skippedIds.has(id));
    const copyRequestGroups = requestGroups
      .map((group) => ({
        ...group,
        secretIds: group.secretIds.filter((id) => !skippedIds.has(id))
      }))
      .filter(({ secretIds }) => secretIds.length > 0);
    const run = (current: Resource[]) =>
      copyLocally({
        current,
        project,
        environment: destinationEnvironmentSlug,
        folderSteps: destinationFolderSteps,
        requestGroups: copyRequestGroups,
        attributes,
        shouldOverwrite: overwriteExisting
      });
    const result = run([...resources]);
    if (result.error) {
      if (result.changed)
        onApply((current) => run(current).next, {
          title: "Some items were copied before the copy stopped",
          description: LOCAL_ONLY
        });
      onToast("bad", { title: result.error, description: "No further items were copied." });
      return;
    }

    const skippedCount = skippedSecretIds.length;
    let notificationText = `${copiedSecretIds.length} ${
      copiedSecretIds.length === 1 ? "secret" : "secrets"
    } copied`;
    if (selectedFolderPaths.length > 0) {
      notificationText += `; ${selectedFolderPaths.length} ${selectedFolderPaths.length === 1 ? "folder" : "folders"} copied`;
    }
    if (copiedSecretIds.length === 0 && skippedCount > 0) {
      notificationText = `${skippedCount} conflicting ${
        skippedCount === 1 ? "secret" : "secrets"
      } skipped`;
    }
    if (skippedCount > 0 && copiedSecretIds.length > 0) {
      notificationText += `; ${skippedCount} ${skippedCount === 1 ? "conflict" : "conflicts"} skipped`;
    }
    if (result.changed)
      onApply((current) => run(current).next, {
        title: notificationText,
        description: LOCAL_ONLY
      });
    else onToast("neutral", { title: notificationText, description: "Nothing changed locally." });
    onCompleted?.();
    onClose();
  };

  const handleSubmit = () => {
    if (disabledReason) return;
    if (conflictingSecrets.length > 0 && !shouldOverwrite) {
      setIsConflictDialogOpen(true);
      return;
    }
    copySecrets({ shouldOverwrite });
  };

  const handleConflictResolution = (resolution: "overwrite" | "skip") => {
    if (disabledReason) return;
    setIsConflictDialogOpen(false);
    copySecrets({
      shouldOverwrite: resolution === "overwrite",
      skippedSecretIds:
        resolution === "skip" ? conflictingSecrets.map(({ sourceSecretId }) => sourceSecretId) : []
    });
  };

  const isBulkSourcePath =
    invocation.origin === "bulk" &&
    normalizedSourcePath === normalizeCopyPath(invocation.sourcePath);
  const sourceEnvironmentOptions = environments.map(({ slug, name }) => ({
    value: slug,
    label: name,
    meta:
      invocation.origin === "bulk" && isBulkSourcePath
        ? `${(invocation.secretsByEnvironment[slug]?.length ?? 0) + (invocation.foldersByEnvironment[slug]?.length ?? 0)}/${invocation.selectedSecretCount + invocation.folderNames.length}`
        : undefined
  }));
  const destinationEnvironmentOptions = environments.map(({ slug, name }) => ({
    value: slug,
    label: name
  }));

  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent className={styles.sheet}>
          <SheetHeader>
            <SheetTitle className={styles.title}>
              Copy secrets
              <Button asChild variant="ghost" size="xs" iconRight="external">
                <a href={DOCUMENTATION_URL} target="_blank" rel="noopener noreferrer">
                  Docs
                </a>
              </Button>
            </SheetTitle>
            <SheetDescription>
              Perform a one-time copy of secrets between project locations.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className={styles.body}>
            <div className={styles.columns}>
              <section className={styles.side} aria-labelledby="copy-source-contents-heading">
                <div className={styles.sideHead}>
                  <h3 id="copy-source-contents-heading" className={styles.sideTitle}>
                    Source
                  </h3>
                  <div className={styles.location}>
                    <Combobox
                      label="Source environment"
                      value={sourceEnvironmentSlug}
                      options={sourceEnvironmentOptions}
                      placeholder="Environment..."
                      onValueChange={(value) => {
                        setSourceEnvironmentSlug(value);
                        setSelection(null);
                      }}
                    />
                    <Input
                      mono
                      icon="folder"
                      aria-label="Source path"
                      value={sourcePath}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => {
                        setSourcePath(event.target.value);
                        setSelection(null);
                      }}
                    />
                  </div>
                  {bulkSelectionSummary && (
                    <SmallText muted aria-live="polite">
                      {bulkSelectionSummary}
                    </SmallText>
                  )}
                  {unavailableValueCount > 0 && (
                    <SmallText muted aria-live="polite">
                      {`${unavailableValueCount} selected ${unavailableValueCount === 1 ? "key has" : "keys have"} no value access and will be copied without values. Existing destination values are preserved.`}
                    </SmallText>
                  )}
                </div>
                <div className={styles.sideContent}>
                  {sourceEnvironmentSlug ? (
                    <CopySecretsTree
                      secrets={sourceSecrets}
                      folders={sourceFolders}
                      selectedFolderPaths={selectedFolderPaths}
                      sourcePath={normalizedSourcePath}
                      selectedIds={selectedIds}
                      onSelectionChange={(secretIds, folderPaths) =>
                        setSelection({ secretIds, folderPaths })
                      }
                    />
                  ) : (
                    <div className={styles.emptyPane}>
                      <EmptyState
                        size="sm"
                        icon="folder"
                        title="Choose a source environment"
                        description="Select an environment to browse its secrets."
                      />
                    </div>
                  )}
                </div>
              </section>
              <div className={styles.arrow} aria-hidden>
                <Icon name="arrow-down" className={styles.arrowDown} />
                <Icon icon={ArrowRightIcon} className={styles.arrowRight} />
              </div>
              <section className={styles.side} aria-labelledby="copy-destination-contents-heading">
                <div className={styles.sideHead}>
                  <h3 id="copy-destination-contents-heading" className={styles.sideTitle}>
                    Destination
                  </h3>
                  <div className={styles.location}>
                    <Combobox
                      label="Destination environment"
                      value={destinationEnvironmentSlug}
                      options={destinationEnvironmentOptions}
                      placeholder="Environment..."
                      onValueChange={setDestinationEnvironmentSlug}
                    />
                    <Input
                      mono
                      icon="folder"
                      aria-label="Destination path"
                      value={destinationPath}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => setDestinationPath(event.target.value)}
                    />
                  </div>
                  {hasDestinationConflicts && (
                    <SmallText muted aria-live="polite">
                      {shouldOverwrite
                        ? "Existing destination keys will be overwritten."
                        : "Choose whether to overwrite or skip conflicting keys when you copy."}
                    </SmallText>
                  )}
                </div>
                <div className={styles.sideContent}>
                  {destinationEnvironmentSlug ? (
                    <CopySecretsTree
                      secrets={destinationContents}
                      folders={previewFolders}
                      sourcePath={normalizedDestinationPath}
                      selectedIds={[]}
                      isReadOnly
                      showChangesFilter
                      previewFilter={destinationPreviewFilter}
                      onPreviewFilterChange={setDestinationPreviewFilter}
                      idPrefix="copy-secrets-destination"
                      onSelectionChange={() => undefined}
                    />
                  ) : (
                    <div className={styles.emptyPane}>
                      <EmptyState
                        size="sm"
                        icon="folder"
                        title="Choose a destination environment"
                        description="Select an environment to preview the copy."
                      />
                    </div>
                  )}
                </div>
              </section>
            </div>
            <SmallText muted>
              Selected shared secrets and folders are copied directly into{" "}
              <span className={styles.pathValue}>{normalizedDestinationPath}</span>, including empty
              folders. Managed secrets, dynamic secrets, and imports are excluded.
            </SmallText>
          </SheetBody>
          <SheetFooter className={styles.footer}>
            <div className={styles.footerStart}>
              <CopySecretsProperties
                attributes={attributes}
                onChange={setAttributes}
                isDisabled={false}
              />
              <div className={styles.overwrite}>
                <Switch
                  id="copy-secrets-overwrite"
                  label="Overwrite existing secrets"
                  checked={shouldOverwrite}
                  onCheckedChange={setShouldOverwrite}
                />
                <Tooltip content="Overwrite matching destination keys, including keys hidden by your access.">
                  <Button type="button" variant="ghost" size="icon-xs" icon="info" iconOnly>
                    About overwriting existing secrets
                  </Button>
                </Tooltip>
              </div>
            </div>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Gate reason={disabledReason}>
              <Button
                type="button"
                icon="copy"
                disabled={Boolean(disabledReason)}
                onClick={handleSubmit}
              >
                Copy {selectedFolderPaths.length ? `${selectedItemCount} items` : selectionLabel}
              </Button>
            </Gate>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={isConflictDialogOpen} onOpenChange={setIsConflictDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resolve secret conflicts</AlertDialogTitle>
            <AlertDialogDescription>
              These secrets already exist at the destination. Overwrite them or copy only secrets
              without conflicts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className={styles.conflicts}>
            {conflictingSecrets.map(
              ({ sourceSecretId, name, destinationPath: conflictDestinationPath }) => (
                <li key={sourceSecretId} className={styles.conflict}>
                  <span className={styles.conflictName}>{name}</span>
                  <span className={styles.conflictPath}>{conflictDestinationPath}</span>
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
              variant="destructive"
              onClick={() => handleConflictResolution("overwrite")}
            >
              Overwrite conflicts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function CopySecretsSheet({ invocation, ...props }: Props) {
  if (!invocation) return null;
  return <CopySecretsSession key={JSON.stringify(invocation)} {...props} invocation={invocation} />;
}
