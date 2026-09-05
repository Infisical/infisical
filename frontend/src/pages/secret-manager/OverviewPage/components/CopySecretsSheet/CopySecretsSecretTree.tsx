import { useMemo, useState } from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  KeyRoundIcon,
  SearchIcon
} from "lucide-react";

import {
  Badge,
  Checkbox,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

import type { CopySecretsFolder, CopySecretsSource } from "./copySecrets.types";
import {
  filterCopyPreviewSecrets,
  getRelativeCopyPath,
  isCopySecretSelectable,
  normalizeCopyPath
} from "./copySecrets.utils";

type FolderNode = {
  name: string;
  path: string;
  secrets: CopySecretsSource[];
  folders: FolderNode[];
  previewStatus?: "new";
};

type Props = {
  secrets: CopySecretsSource[];
  sourcePath: string;
  folders: CopySecretsFolder[];
  selectedIds: string[];
  selectedFolderPaths?: string[];
  isDisabled?: boolean;
  isReadOnly?: boolean;
  includeValues?: boolean;
  showChangesFilter?: boolean;
  idPrefix?: string;
  onSelectionChange: (selectedIds: string[], folderPaths: string[]) => void;
};

type PreviewFilter = "all" | "changes";

const getRestrictionLabel = (secret: CopySecretsSource) => {
  if (secret.isRotated) return "Managed rotation";
  if (secret.isHoneyToken) return "Honey token";
  if (secret.isValueHidden) return "No value access";
  return undefined;
};

const createTree = (
  secrets: CopySecretsSource[],
  folders: CopySecretsFolder[],
  sourcePath: string
): FolderNode => {
  const root: FolderNode = {
    name: normalizeCopyPath(sourcePath),
    path: normalizeCopyPath(sourcePath),
    secrets: [],
    folders: []
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
            folders: []
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

  return root;
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

const getPreviewLabel = (status: NonNullable<CopySecretsSource["previewStatus"]>) => {
  if (status === "new") return "New";
  if (status === "overwrite") return "Overwrite";
  return "Conflict";
};

const Folder = ({
  node,
  selectionNode,
  selectedIds,
  selectedFolderPaths,
  isDisabled,
  isReadOnly,
  includeValues,
  idPrefix,
  onSelectionChange,
  isRoot = false
}: {
  node: FolderNode;
  selectionNode: FolderNode;
  selectedIds: Set<string>;
  selectedFolderPaths: Set<string>;
  isDisabled: boolean;
  isReadOnly: boolean;
  includeValues: boolean;
  idPrefix: string;
  onSelectionChange: (ids: string[], folderPaths: string[]) => void;
  isRoot?: boolean;
}) => {
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
      <CollapsiblePrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
        <div
          className={cn(
            "grid min-h-9 items-center gap-2 rounded-sm px-2 hover:bg-container-hover",
            isReadOnly
              ? "grid-cols-[1rem_1rem_minmax(0,1fr)_auto]"
              : "grid-cols-[1rem_1rem_1rem_minmax(0,1fr)_auto]"
          )}
        >
          <CollapsiblePrimitive.Trigger
            type="button"
            className="rounded-xs text-muted focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.name}`}
          >
            {isOpen ? (
              <ChevronDownIcon className="size-4" />
            ) : (
              <ChevronRightIcon className="size-4" />
            )}
          </CollapsiblePrimitive.Trigger>
          {isOpen ? (
            <FolderOpenIcon className="size-4 text-folder" aria-hidden />
          ) : (
            <FolderIcon className="size-4 text-folder" aria-hidden />
          )}
          {!isReadOnly && (
            <Checkbox
              id={checkboxId}
              variant="project"
              isChecked={allSelected || selectedCount > 0 || selectedFolderCount > 0}
              isIndeterminate={!allSelected && (selectedCount > 0 || selectedFolderCount > 0)}
              isDisabled={isDisabled || selectableIds.length + folderPaths.length === 0}
              onCheckedChange={(checked) => toggleFolder(checked === true)}
            />
          )}
          {isReadOnly ? (
            <span
              className={cn(
                "min-w-0 flex-1 truncate font-mono text-xs text-foreground",
                isRoot && "font-medium"
              )}
            >
              {node.name}
            </span>
          ) : (
            <label
              htmlFor={checkboxId}
              className={cn(
                "min-w-0 flex-1 cursor-pointer truncate font-mono text-xs text-foreground",
                isRoot && "font-medium"
              )}
            >
              {node.name}
            </label>
          )}
          <span className="text-xs text-muted">
            {node.previewStatus ? (
              <Badge variant="outline">New folder</Badge>
            ) : (
              `${isReadOnly ? getAllIds(node).length : selectableIds.length} secrets`
            )}
          </span>
        </div>
        <CollapsiblePrimitive.Content>
          <ul className={cn(!isRoot && "ml-4 border-l border-border pl-2")}>
            {[...node.secrets]
              .sort((left, right) => left.name.localeCompare(right.name))
              .map((secret) => {
                const secretId = `${idPrefix}-secret-${secret.id}`;
                const disabledReason = !isCopySecretSelectable(secret)
                  ? "This managed secret cannot be copied"
                  : undefined;
                const valueNote =
                  includeValues && secret.isValueHidden
                    ? "No value access: this key will be copied without its value. Existing destination values are preserved."
                    : undefined;
                const restrictionLabel = getRestrictionLabel(secret);
                return (
                  <li
                    key={secret.id}
                    className={cn(
                      "grid min-h-9 items-center gap-2 rounded-sm px-2 hover:bg-container-hover",
                      isReadOnly
                        ? "grid-cols-[1rem_1rem_minmax(0,1fr)_auto]"
                        : "grid-cols-[1rem_1rem_1rem_minmax(0,1fr)_auto]"
                    )}
                  >
                    <span className="size-4" aria-hidden />
                    <KeyRoundIcon className="size-4 text-secret" aria-hidden />
                    {!isReadOnly && (
                      <Checkbox
                        id={secretId}
                        variant="project"
                        isChecked={selectedIds.has(secret.id)}
                        isDisabled={isDisabled || Boolean(disabledReason)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedIds);
                          if (checked === true) next.add(secret.id);
                          else next.delete(secret.id);
                          onSelectionChange([...next], [...selectedFolderPaths]);
                        }}
                      />
                    )}
                    {isReadOnly ? (
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                        {secret.name}
                      </span>
                    ) : (
                      <label
                        htmlFor={secretId}
                        className={cn(
                          "min-w-0 flex-1 truncate font-mono text-xs",
                          disabledReason
                            ? "cursor-not-allowed text-muted"
                            : "cursor-pointer text-foreground"
                        )}
                      >
                        {secret.name}
                      </label>
                    )}
                    {restrictionLabel && !isReadOnly && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`${secret.name}: ${restrictionLabel}`}
                          >
                            <Badge variant="neutral">{restrictionLabel}</Badge>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-72">
                          {valueNote ?? "This secret will be copied without its value."}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {secret.previewStatus && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`${secret.name}: ${getPreviewLabel(secret.previewStatus)}`}
                          >
                            <Badge variant={secret.previewStatus === "new" ? "outline" : "warning"}>
                              {getPreviewLabel(secret.previewStatus)}
                            </Badge>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-72">
                          {secret.previewStatus === "conflict"
                            ? "This key already exists. Choose whether to overwrite or skip it when you copy."
                            : "This key will be created at the destination."}
                          {secret.isValueHidden &&
                            " Its source value is unavailable; existing destination values are preserved."}
                        </TooltipContent>
                      </Tooltip>
                    )}
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
                  includeValues={includeValues}
                  idPrefix={idPrefix}
                  onSelectionChange={onSelectionChange}
                />
              ))}
          </ul>
        </CollapsiblePrimitive.Content>
      </CollapsiblePrimitive.Root>
    </li>
  );
};

export const CopySecretsSecretTree = ({
  secrets,
  sourcePath,
  folders,
  selectedIds,
  selectedFolderPaths = [],
  isDisabled = false,
  isReadOnly = false,
  includeValues = false,
  showChangesFilter = false,
  idPrefix = "copy-secrets",
  onSelectionChange
}: Props) => {
  const [search, setSearch] = useState("");
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>("changes");
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
  const previewSecrets = useMemo(
    () => (showChangesFilter && previewFilter === "changes" ? changedSecrets : scopedSecrets),
    [changedSecrets, previewFilter, scopedSecrets, showChangesFilter]
  );
  const filteredSecrets = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return previewSecrets;
    return previewSecrets.filter(
      ({ name, path }) =>
        name.toLocaleLowerCase().includes(query) || path.toLocaleLowerCase().includes(query)
    );
  }, [previewSecrets, search]);
  const scopedFolders = folders.filter(
    ({ path }) => getRelativeCopyPath(path, sourcePath) !== null
  );
  const previewFolders = scopedFolders.filter(
    (folder) => !showChangesFilter || previewFilter === "all" || folder.previewStatus
  );
  const filteredFolders = previewFolders.filter(
    ({ path }) =>
      !search.trim() || path.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  );
  const tree = createTree(filteredSecrets, filteredFolders, sourcePath);
  const selectionTree = createTree(scopedSecrets, scopedFolders, sourcePath);
  let countLabel = `${selectedIds.length} secrets, ${selectedFolderPaths.length} folders selected`;
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

  const searchInput = (
    <div className="relative min-w-0 flex-1">
      <SearchIcon
        className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <Input
        aria-label="Filter secrets and folders"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        placeholder="Filter keys or folders..."
        className="pl-9"
      />
    </div>
  );

  const renderTree = () =>
    filteredSecrets.length || filteredFolders.length ? (
      <ul aria-label={`Secrets under ${normalizeCopyPath(sourcePath)}`}>
        <Folder
          node={tree}
          selectionNode={selectionTree}
          selectedIds={new Set(selectedIds)}
          selectedFolderPaths={new Set(selectedFolderPaths)}
          isDisabled={isDisabled}
          isReadOnly={isReadOnly}
          includeValues={includeValues}
          idPrefix={idPrefix}
          onSelectionChange={onSelectionChange}
          isRoot
        />
      </ul>
    ) : (
      <div className="flex min-h-48 items-center justify-center px-4 text-sm text-muted">
        {emptyMessage}
      </div>
    );

  const rootClassName =
    "h-full min-h-0 overflow-hidden rounded-md border border-border bg-container p-2";

  if (showChangesFilter) {
    return (
      <Tabs
        id={`${idPrefix}-selection`}
        value={previewFilter}
        onValueChange={(value) => setPreviewFilter(value as PreviewFilter)}
        className={rootClassName}
      >
        <div className="flex items-center gap-2">
          {searchInput}
          <TabsList aria-label="Destination preview">
            <TabsTrigger value="all">
              All{" "}
              <span className="text-xs text-muted">
                {scopedSecrets.length + scopedFolders.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="changes">
              Changes{" "}
              <span className="text-xs text-muted">
                {changedSecrets.length +
                  scopedFolders.filter((folder) => folder.previewStatus).length}
              </span>
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="all" className="min-h-0 overflow-y-auto">
          {renderTree()}
        </TabsContent>
        <TabsContent value="changes" className="min-h-0 overflow-y-auto">
          {renderTree()}
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <div id={`${idPrefix}-selection`} className={`flex flex-col gap-2 ${rootClassName}`}>
      <div className="flex items-center gap-2">
        {searchInput}
        <span className="mr-3 shrink-0 text-xs text-muted" aria-live="polite">
          {countLabel}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{renderTree()}</div>
    </div>
  );
};
