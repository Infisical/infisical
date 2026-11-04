import { useMemo, useState } from "react";

import { Badge } from "@app/components/v4/ui/badge";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@app/components/v4/ui/collapsible";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { ScrollArea } from "@app/components/v4/ui/scroll-area";
import { Tabs } from "@app/components/v4/ui/tabs";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import type {
  CopySecretsFolder,
  CopySecretsSource
} from "@app/pages/secret-manager/OverviewPage/components/CopySecretsSheet/copySecrets.types";
import {
  filterCopyPreviewSecrets,
  getRelativeCopyPath,
  isCopySecretSelectable,
  normalizeCopyPath
} from "@app/pages/secret-manager/OverviewPage/components/CopySecretsSheet/copySecrets.utils";

import styles from "./copy-secrets.module.css";

type FolderNode = {
  name: string;
  path: string;
  secrets: CopySecretsSource[];
  folders: FolderNode[];
  previewStatus?: "new";
  hasPreviewChanges: boolean;
};

export type PreviewFilter = "all" | "changes";

const getRestrictionLabel = (secret: CopySecretsSource) => {
  if (secret.isRotated) return "Managed rotation";
  if (secret.isHoneyToken) return "Honey token";
  if (secret.isValueHidden) return "No value access";
  return undefined;
};

const getRestrictionDescription = (secret: CopySecretsSource) => {
  if (secret.isRotated) return "Rotated secrets cannot be copied.";
  if (secret.isHoneyToken) return "Honey token secrets cannot be copied.";
  return "No value access: this key will be copied without its value. Existing destination values are preserved.";
};

const getPreviewLabel = (status: NonNullable<CopySecretsSource["previewStatus"]>) => {
  if (status === "new") return "New";
  if (status === "overwrite") return "Overwrite";
  return "Conflict";
};

const getPreviewDescription = (secret: CopySecretsSource) =>
  [
    secret.previewStatus === "conflict" &&
      "This key already exists. Choose whether to overwrite or skip it when you copy.",
    secret.previewStatus === "overwrite" && "This key already exists and will be overwritten.",
    secret.previewStatus === "new" && "This key will be created at the destination.",
    secret.isValueHidden &&
      "Its source value is unavailable; existing destination values are preserved."
  ]
    .filter(Boolean)
    .join(" ");

const createTree = (
  secrets: CopySecretsSource[],
  folders: CopySecretsFolder[],
  sourcePath: string
): FolderNode => {
  const root: FolderNode = {
    name: normalizeCopyPath(sourcePath),
    path: normalizeCopyPath(sourcePath),
    secrets: [],
    folders: [],
    hasPreviewChanges: false
  };

  const ensureFolder = (path: string) => {
    const relativePath = getRelativeCopyPath(path, sourcePath);
    if (relativePath === null) return null;
    let node = root;
    relativePath
      .split("/")
      .filter(Boolean)
      .forEach((segment) => {
        let child = node.folders.find(({ name }) => name === segment);
        if (!child) {
          child = {
            name: segment,
            path: `${node.path === "/" ? "" : node.path}/${segment}`,
            secrets: [],
            folders: [],
            hasPreviewChanges: false
          };
          node.folders.push(child);
        }
        node = child;
      });
    return node;
  };
  folders.forEach((folder) => {
    const node = ensureFolder(folder.path);
    if (node) node.previewStatus = folder.previewStatus;
  });
  secrets.forEach((secret) => ensureFolder(secret.path)?.secrets.push(secret));

  const setPreviewChanges = (node: FolderNode): FolderNode => {
    const childFolders = node.folders.map(setPreviewChanges);
    return {
      ...node,
      folders: childFolders,
      hasPreviewChanges:
        Boolean(node.previewStatus) ||
        node.secrets.some(({ previewStatus }) => Boolean(previewStatus)) ||
        childFolders.some(({ hasPreviewChanges }) => hasPreviewChanges)
    };
  };

  return setPreviewChanges(root);
};

const getSelectableIds = (node: FolderNode): string[] => [
  ...node.secrets.filter(isCopySecretSelectable).map(({ id }) => id),
  ...node.folders.flatMap((folder) => getSelectableIds(folder))
];

const getFolderPaths = (node: FolderNode): string[] => [
  ...(node.path === "/" ? [] : [node.path]),
  ...node.folders.flatMap(getFolderPaths)
];

const getAllIds = (node: FolderNode): string[] => [
  ...node.secrets.map(({ id }) => id),
  ...node.folders.flatMap(getAllIds)
];

function Folder({
  node,
  selectionNode,
  selectedIds,
  selectedFolderPaths,
  isDisabled,
  isReadOnly,
  isChangePreview,
  idPrefix,
  onSelectionChange
}: {
  node: FolderNode;
  selectionNode: FolderNode;
  selectedIds: Set<string>;
  selectedFolderPaths: Set<string>;
  isDisabled: boolean;
  isReadOnly: boolean;
  isChangePreview: boolean;
  idPrefix: string;
  onSelectionChange: (ids: string[], folderPaths: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const selectableIds = getSelectableIds(selectionNode);
  const folderPaths = getFolderPaths(selectionNode);
  const selectedFolderCount = folderPaths.filter((path) => selectedFolderPaths.has(path)).length;
  const allSelected =
    selectableIds.every((id) => selectedIds.has(id)) &&
    folderPaths.every((path) => selectedFolderPaths.has(path)) &&
    selectableIds.length + folderPaths.length > 0;
  const selectedCount = selectableIds.filter((id) => selectedIds.has(id)).length;
  const checkboxId = `${idPrefix}-folder-${encodeURIComponent(node.path)}`;

  const toggleFolder = (isChecked: boolean) => {
    const next = new Set(selectedIds);
    selectableIds.forEach((id) => (isChecked ? next.add(id) : next.delete(id)));
    const nextFolders = new Set(selectedFolderPaths);
    folderPaths.forEach((path) => (isChecked ? nextFolders.add(path) : nextFolders.delete(path)));
    onSelectionChange([...next], [...nextFolders]);
  };

  return (
    <li>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div
          className={styles.treeRow}
          data-read-only={isReadOnly || undefined}
          data-dimmed={(isChangePreview && !node.hasPreviewChanges) || undefined}
        >
          <CollapsibleTrigger
            type="button"
            className={styles.treeToggle}
            aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.name}`}
          >
            <Icon name={isOpen ? "folder-open" : "folder"} className={styles.folderGlyph} />
            <Icon name="chev-right" className={styles.chevronGlyph} />
          </CollapsibleTrigger>
          {!isReadOnly && (
            <Checkbox
              id={checkboxId}
              checked={allSelected || selectedCount > 0 || selectedFolderCount > 0}
              indeterminate={!allSelected && (selectedCount > 0 || selectedFolderCount > 0)}
              disabled={isDisabled || selectableIds.length + folderPaths.length === 0}
              onCheckedChange={(checked) => toggleFolder(checked === true)}
            />
          )}
          {isReadOnly ? (
            <span className={styles.treeName}>{node.name}</span>
          ) : (
            <label htmlFor={checkboxId} className={styles.treeName}>
              {node.name}
            </label>
          )}
          <span className={styles.treeMeta}>
            {node.previewStatus ? (
              <Badge tone="outline">New folder</Badge>
            ) : (
              `${isReadOnly ? getAllIds(node).length : selectableIds.length} secrets`
            )}
          </span>
        </div>
        <CollapsibleContent>
          <ul className={styles.treeChildren}>
            {[...node.secrets]
              .sort((left, right) => left.name.localeCompare(right.name))
              .map((secret) => {
                const secretId = `${idPrefix}-secret-${secret.id}`;
                const isSelectable = isCopySecretSelectable(secret);
                const restrictionLabel = getRestrictionLabel(secret);
                return (
                  <li
                    key={secret.id}
                    className={styles.treeRow}
                    data-read-only={isReadOnly || undefined}
                    data-dimmed={(isChangePreview && !secret.previewStatus) || undefined}
                  >
                    <Icon name="key" className={styles.secretGlyph} />
                    {!isReadOnly && (
                      <Checkbox
                        id={secretId}
                        checked={selectedIds.has(secret.id)}
                        disabled={isDisabled || !isSelectable}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedIds);
                          if (checked === true) next.add(secret.id);
                          else next.delete(secret.id);
                          onSelectionChange([...next], [...selectedFolderPaths]);
                        }}
                      />
                    )}
                    {isReadOnly ? (
                      <span className={styles.treeName}>{secret.name}</span>
                    ) : (
                      <label
                        htmlFor={secretId}
                        className={styles.treeName}
                        data-disabled={!isSelectable || undefined}
                      >
                        {secret.name}
                      </label>
                    )}
                    <span className={styles.treeMeta}>
                      {restrictionLabel && !isReadOnly && (
                        <Tooltip content={getRestrictionDescription(secret)}>
                          <button
                            type="button"
                            className={styles.badgeButton}
                            aria-label={`${secret.name}: ${restrictionLabel}`}
                          >
                            <Badge tone="soft">{restrictionLabel}</Badge>
                          </button>
                        </Tooltip>
                      )}
                      {secret.previewStatus && (
                        <Tooltip content={getPreviewDescription(secret)}>
                          <button
                            type="button"
                            className={styles.badgeButton}
                            aria-label={`${secret.name}: ${getPreviewLabel(secret.previewStatus)}`}
                          >
                            <Badge tone={secret.previewStatus === "new" ? "outline" : "warn"}>
                              {getPreviewLabel(secret.previewStatus)}
                            </Badge>
                          </button>
                        </Tooltip>
                      )}
                    </span>
                  </li>
                );
              })}
            {[...node.folders]
              .sort((left, right) => left.name.localeCompare(right.name))
              .map((folder) => (
                <Folder
                  key={folder.path}
                  node={folder}
                  selectionNode={
                    selectionNode.folders.find(({ path }) => path === folder.path) ?? folder
                  }
                  selectedIds={selectedIds}
                  selectedFolderPaths={selectedFolderPaths}
                  isDisabled={isDisabled}
                  isReadOnly={isReadOnly}
                  isChangePreview={isChangePreview}
                  idPrefix={idPrefix}
                  onSelectionChange={onSelectionChange}
                />
              ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

export function CopySecretsTree({
  secrets,
  sourcePath,
  folders,
  selectedIds,
  selectedFolderPaths = [],
  isDisabled = false,
  isReadOnly = false,
  showChangesFilter = false,
  previewFilter: controlledPreviewFilter,
  onPreviewFilterChange,
  idPrefix = "copy-secrets",
  onSelectionChange
}: {
  secrets: CopySecretsSource[];
  sourcePath: string;
  folders: CopySecretsFolder[];
  selectedIds: string[];
  selectedFolderPaths?: string[];
  isDisabled?: boolean;
  isReadOnly?: boolean;
  showChangesFilter?: boolean;
  previewFilter?: PreviewFilter;
  onPreviewFilterChange?: (filter: PreviewFilter) => void;
  idPrefix?: string;
  onSelectionChange: (selectedIds: string[], folderPaths: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [internalPreviewFilter, setInternalPreviewFilter] = useState<PreviewFilter>("changes");
  const previewFilter = controlledPreviewFilter ?? internalPreviewFilter;
  const scopedSecrets = useMemo(
    () => filterCopyPreviewSecrets({ secrets, rootPath: sourcePath }),
    [secrets, sourcePath]
  );
  const changedSecrets = useMemo(
    () =>
      filterCopyPreviewSecrets({
        secrets: scopedSecrets,
        rootPath: sourcePath,
        changesOnly: true
      }),
    [scopedSecrets, sourcePath]
  );
  const previewSecrets =
    showChangesFilter && previewFilter === "changes" ? changedSecrets : scopedSecrets;
  const query = search.trim().toLocaleLowerCase();
  const filteredSecrets = query
    ? previewSecrets.filter(
        ({ name, path }) =>
          name.toLocaleLowerCase().includes(query) || path.toLocaleLowerCase().includes(query)
      )
    : previewSecrets;
  const scopedFolders = folders.filter(
    ({ path }) => getRelativeCopyPath(path, sourcePath) !== null
  );
  const previewFolders = scopedFolders.filter(
    (folder) => !showChangesFilter || previewFilter === "all" || folder.previewStatus
  );
  const filteredFolders = previewFolders.filter(
    ({ path }) => !query || path.toLocaleLowerCase().includes(query)
  );
  const tree = createTree(filteredSecrets, filteredFolders, sourcePath);
  const selectionTree = createTree(scopedSecrets, scopedFolders, sourcePath);
  const selectionCountLabel = `${selectedIds.length} ${selectedIds.length === 1 ? "secret" : "secrets"} and ${selectedFolderPaths.length} ${selectedFolderPaths.length === 1 ? "folder" : "folders"} selected`;
  let countLabel = selectionCountLabel;
  if (isReadOnly) {
    let countUnit = previewSecrets.length === 1 ? "item" : "items";
    if (previewFilter === "changes") countUnit = "changes";
    countLabel = `${previewSecrets.length} ${countUnit}`;
  }

  let emptyMessage =
    scopedSecrets.length || scopedFolders.length
      ? "No secrets or folders match this filter."
      : "No accessible secrets or folders found.";
  if (showChangesFilter && previewFilter === "changes" && !previewSecrets.length) {
    emptyMessage = "No changes to preview.";
  }

  return (
    <div id={`${idPrefix}-selection`} className={styles.treePane}>
      <div className={styles.treeToolbar}>
        <Input
          icon="search"
          className={styles.grow}
          aria-label="Filter secrets and folders"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
          placeholder="Filter keys or folders..."
        />
        {showChangesFilter && (
          <Tabs
            variant="segmented"
            label="Destination preview"
            value={previewFilter}
            onValueChange={(value) => {
              const nextFilter = value as PreviewFilter;
              setInternalPreviewFilter(nextFilter);
              onPreviewFilterChange?.(nextFilter);
            }}
            tabs={[
              { value: "all", label: "All", count: scopedSecrets.length + scopedFolders.length },
              {
                value: "changes",
                label: "Changes",
                count:
                  changedSecrets.length +
                  scopedFolders.filter((folder) => folder.previewStatus).length
              }
            ]}
          />
        )}
        {!showChangesFilter && isReadOnly && (
          <span className={styles.treeCount} aria-live="polite">
            {countLabel}
          </span>
        )}
        {!isReadOnly && (
          <span className={styles.treeCount} aria-live="polite">
            <span className={styles.srOnly}>{selectionCountLabel}</span>
            <span className={styles.countItem} aria-hidden>
              <Icon name="key" size={14} />
              {selectedIds.length}
            </span>
            <span className={styles.countItem} aria-hidden>
              <Icon name="folder" size={14} />
              {selectedFolderPaths.length}
            </span>
          </span>
        )}
      </div>
      <ScrollArea className={styles.treeScroll}>
        {filteredSecrets.length || filteredFolders.length ? (
          <ul className={styles.tree} aria-label={`Secrets under ${normalizeCopyPath(sourcePath)}`}>
            <Folder
              node={tree}
              selectionNode={selectionTree}
              selectedIds={new Set(selectedIds)}
              selectedFolderPaths={new Set(selectedFolderPaths)}
              isDisabled={isDisabled}
              isReadOnly={isReadOnly}
              isChangePreview={showChangesFilter}
              idPrefix={idPrefix}
              onSelectionChange={onSelectionChange}
            />
          </ul>
        ) : (
          <div className={styles.treeEmpty}>{emptyMessage}</div>
        )}
      </ScrollArea>
    </div>
  );
}
