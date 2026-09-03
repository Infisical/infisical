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
  TabsTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

import type { CopySecretsSource } from "./copySecrets.types";
import {
  filterCopyPreviewSecrets,
  getRelativeCopyPath,
  normalizeCopyPath
} from "./copySecrets.utils";

type FolderNode = {
  name: string;
  path: string;
  secrets: CopySecretsSource[];
  folders: FolderNode[];
};

type Props = {
  secrets: CopySecretsSource[];
  sourcePath: string;
  selectedIds: string[];
  isDisabled?: boolean;
  isReadOnly?: boolean;
  showChangesFilter?: boolean;
  idPrefix?: string;
  onSelectionChange: (selectedIds: string[]) => void;
};

type PreviewFilter = "all" | "changes";

const isSecretDisabled = (secret: CopySecretsSource) =>
  Boolean(secret.isRotated || secret.isHoneyToken);

const getDisabledReason = (secret: CopySecretsSource) => {
  if (secret.isRotated) return "Managed rotation secrets cannot be copied";
  if (secret.isHoneyToken) return "Honey tokens cannot be copied";
  return undefined;
};

const createTree = (secrets: CopySecretsSource[], sourcePath: string): FolderNode => {
  const root: FolderNode = {
    name: normalizeCopyPath(sourcePath),
    path: normalizeCopyPath(sourcePath),
    secrets: [],
    folders: []
  };

  secrets.forEach((secret) => {
    const relativePath = getRelativeCopyPath(secret.path, sourcePath);
    if (relativePath === null) return;

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
    node.secrets.push(secret);
  });

  return root;
};

const getSelectableIds = (node: FolderNode): string[] => [
  ...node.secrets.filter((secret) => !isSecretDisabled(secret)).map(({ id }) => id),
  ...node.folders.flatMap(getSelectableIds)
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
  selectedIds,
  isDisabled,
  isReadOnly,
  idPrefix,
  onSelectionChange,
  isRoot = false
}: {
  node: FolderNode;
  selectedIds: Set<string>;
  isDisabled: boolean;
  isReadOnly: boolean;
  idPrefix: string;
  onSelectionChange: (ids: string[]) => void;
  isRoot?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const selectableIds = getSelectableIds(node);
  const selectedCount = selectableIds.filter((id) => selectedIds.has(id)).length;
  const checkboxId = `${idPrefix}-folder-${node.path.replaceAll("/", "-") || "root"}`;

  const toggleFolder = (isChecked: boolean) => {
    const next = new Set(selectedIds);
    selectableIds.forEach((id) => (isChecked ? next.add(id) : next.delete(id)));
    onSelectionChange([...next]);
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
              isChecked={selectedCount > 0}
              isIndeterminate={selectedCount > 0 && selectedCount < selectableIds.length}
              isDisabled={isDisabled || selectableIds.length === 0}
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
            {isReadOnly ? getAllIds(node).length : selectableIds.length}
          </span>
        </div>
        <CollapsiblePrimitive.Content>
          <ul className={cn(!isRoot && "ml-4 border-l border-border pl-2")}>
            {[...node.secrets]
              .sort((left, right) => left.name.localeCompare(right.name))
              .map((secret) => {
                const secretId = `${idPrefix}-secret-${secret.id}`;
                const disabledReason = getDisabledReason(secret);
                return (
                  <li
                    key={secret.id}
                    className={cn(
                      "grid min-h-9 items-center gap-2 rounded-sm px-2 hover:bg-container-hover",
                      isReadOnly
                        ? "grid-cols-[1rem_1rem_minmax(0,1fr)_auto]"
                        : "grid-cols-[1rem_1rem_1rem_minmax(0,1fr)_auto]"
                    )}
                    title={disabledReason}
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
                          onSelectionChange([...next]);
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
                    {secret.previewStatus && (
                      <Badge
                        variant={secret.previewStatus === "new" ? "outline" : "warning"}
                        className="shrink-0"
                      >
                        {getPreviewLabel(secret.previewStatus)}
                      </Badge>
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
                  selectedIds={selectedIds}
                  isDisabled={isDisabled}
                  isReadOnly={isReadOnly}
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
  selectedIds,
  isDisabled = false,
  isReadOnly = false,
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
  const tree = useMemo(
    () => createTree(filteredSecrets, sourcePath),
    [filteredSecrets, sourcePath]
  );
  let countLabel = `${selectedIds.length} selected`;
  if (isReadOnly) {
    let countUnit = previewSecrets.length === 1 ? "item" : "items";
    if (previewFilter === "changes") countUnit = "changes";
    countLabel = `${previewSecrets.length} ${countUnit}`;
  }

  let emptyMessage = scopedSecrets.length
    ? "No secrets match this filter."
    : "No accessible secrets found.";
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
        aria-label="Filter secrets"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Filter keys..."
        className="pl-9"
      />
    </div>
  );

  const renderTree = () =>
    filteredSecrets.length ? (
      <ul aria-label={`Secrets under ${normalizeCopyPath(sourcePath)}`}>
        <Folder
          node={tree}
          selectedIds={new Set(selectedIds)}
          isDisabled={isDisabled}
          isReadOnly={isReadOnly}
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
              All <span className="text-xs text-muted">{scopedSecrets.length}</span>
            </TabsTrigger>
            <TabsTrigger value="changes">
              Changes <span className="text-xs text-muted">{changedSecrets.length}</span>
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
