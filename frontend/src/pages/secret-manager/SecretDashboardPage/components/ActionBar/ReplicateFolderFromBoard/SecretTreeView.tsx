import { useId, useMemo, useState } from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderTreeIcon,
  KeyRoundIcon
} from "lucide-react";

import {
  Button,
  Checkbox,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

interface SecretItem {
  id: string;
  secretKey: string;
  secretValue?: string;
  secretPath: string;
}

interface FolderStructure {
  items: SecretItem[];
  subFolders: Record<string, FolderStructure>;
}

interface FolderProps {
  name: string;
  structure: FolderStructure;
  path: string;
  selectedItems: SecretItem[];
  onItemSelect: (item: SecretItem, isChecked: boolean) => void;
  onFolderSelect: (folderPath: string, isChecked: boolean) => void;
  isExpanded?: boolean;
  level: number;
  basePath: string;
  isDisabled?: boolean;
}

interface TreeViewProps {
  data: FolderStructure | null;
  selectedItems: SecretItem[];
  basePath?: string;
  className?: string;
  onChange: (items: SecretItem[]) => void;
  onRetry: () => void;
  isDisabled?: boolean;
  isLoading?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  isInvalidPath?: boolean;
}

const getAllItemsInFolder = (folder: FolderStructure): SecretItem[] => [
  ...folder.items,
  ...Object.values(folder.subFolders).flatMap(getAllItemsInFolder)
];

const getDisplayName = (name: string) => name.split("/").filter(Boolean).at(-1) ?? "/";

const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
const CollapsibleContent = CollapsiblePrimitive.Content;

const Folder = ({
  name,
  structure,
  path,
  selectedItems,
  onItemSelect,
  onFolderSelect,
  isExpanded = false,
  level,
  basePath,
  isDisabled = false
}: FolderProps) => {
  const [open, setOpen] = useState(isExpanded);
  const checkboxId = useId();
  const secretCheckboxIdPrefix = useId();
  const folderLabel = level === 0 ? basePath : getDisplayName(name);
  const allItems = useMemo(() => getAllItemsInFolder(structure), [structure]);
  const allItemIds = useMemo(() => allItems.map((item) => item.id), [allItems]);
  const selectedItemIds = useMemo(() => selectedItems.map((item) => item.id), [selectedItems]);
  const allSelected =
    allItemIds.length > 0 && allItemIds.every((id) => selectedItemIds.includes(id));
  const someSelected = !allSelected && allItemIds.some((id) => selectedItemIds.includes(id));
  const hasContents = structure.items.length > 0 || Object.keys(structure.subFolders).length > 0;
  let FolderGlyph = FolderIcon;
  if (level === 0) FolderGlyph = FolderTreeIcon;
  else if (open) FolderGlyph = FolderOpenIcon;

  return (
    <li className={cn(level > 0 && "ml-4")}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="group flex min-h-8 items-center rounded-sm px-2 py-1 hover:bg-container-hover">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="mr-1 flex size-7 items-center justify-center rounded-sm text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50"
              disabled={!hasContents}
              aria-label={`${open ? "Collapse" : "Expand"} ${folderLabel}`}
            >
              {hasContents &&
                (open ? (
                  <ChevronDownIcon className="size-3.5" />
                ) : (
                  <ChevronRightIcon className="size-3.5" />
                ))}
            </button>
          </CollapsibleTrigger>

          <FolderGlyph className="mr-2 size-4 text-folder" aria-hidden />

          <Checkbox
            id={checkboxId}
            variant="project"
            isChecked={allSelected || someSelected}
            onCheckedChange={(checked) => onFolderSelect(path, checked === true)}
            isIndeterminate={someSelected}
            isDisabled={isDisabled || allItemIds.length === 0}
          />
          <label
            htmlFor={checkboxId}
            className={cn(
              "ml-2 min-w-0 flex-1 truncate text-sm text-foreground",
              isDisabled || allItemIds.length === 0 ? "cursor-not-allowed" : "cursor-pointer",
              level === 0 && "font-mono text-xs"
            )}
            title={folderLabel}
          >
            {folderLabel}
          </label>

          {allItemIds.length > 0 && (
            <span className="ml-2 text-xs text-muted">
              {allItemIds.length} {allItemIds.length === 1 ? "item" : "items"}
            </span>
          )}
        </div>

        <CollapsibleContent>
          <ul className="relative ml-5 border-l border-border pl-1">
            {[...structure.items]
              .sort((a, b) => a.secretKey.localeCompare(b.secretKey))
              .map((item) => {
                const checkboxItemId = `${secretCheckboxIdPrefix}-${item.id}`;

                return (
                  <li
                    key={item.id}
                    className="group ml-4 flex min-h-8 items-center rounded-sm px-2 py-1 hover:bg-container-hover"
                  >
                    <KeyRoundIcon className="mr-2 ml-7 size-3.5 text-secret" aria-hidden />
                    <Checkbox
                      id={checkboxItemId}
                      variant="project"
                      isChecked={selectedItemIds.includes(item.id)}
                      onCheckedChange={(checked) => onItemSelect(item, checked === true)}
                      isDisabled={isDisabled}
                    />
                    <label
                      htmlFor={checkboxItemId}
                      className={cn(
                        "ml-2 min-w-0 flex-1 truncate font-mono text-xs text-foreground",
                        isDisabled ? "cursor-not-allowed" : "cursor-pointer"
                      )}
                      title={item.secretKey}
                    >
                      {item.secretKey}
                    </label>
                  </li>
                );
              })}

            {Object.entries(structure.subFolders)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([subName, subStructure]) => (
                <Folder
                  key={subName}
                  name={subName}
                  structure={subStructure}
                  path={`${path === "/" ? "" : path}/${subName}`}
                  selectedItems={selectedItems}
                  onItemSelect={onItemSelect}
                  onFolderSelect={onFolderSelect}
                  level={level + 1}
                  basePath={basePath}
                  isDisabled={isDisabled}
                />
              ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
};

export const SecretTreeView = ({
  data,
  selectedItems,
  basePath = "/",
  className,
  onChange,
  onRetry,
  isDisabled = false,
  isLoading = false,
  isFetching = false,
  isError = false,
  isInvalidPath = false
}: TreeViewProps) => {
  const isEmptyData =
    Boolean(data) && data?.items.length === 0 && Object.keys(data.subFolders).length === 0;

  const handleItemSelect = (item: SecretItem, isChecked: boolean) => {
    if (isChecked) {
      if (!selectedItems.some(({ id }) => id === item.id)) onChange([...selectedItems, item]);
      return;
    }

    onChange(selectedItems.filter(({ id }) => id !== item.id));
  };

  const handleFolderSelect = (folderPath: string, isChecked: boolean) => {
    if (!data) return;

    const folder =
      folderPath === "/"
        ? data
        : folderPath
            .split("/")
            .filter(Boolean)
            .reduce<FolderStructure | null>(
              (currentFolder, segment) => currentFolder?.subFolders[segment] ?? null,
              data
            );

    if (!folder) return;

    const folderItems = getAllItemsInFolder(folder);
    const folderItemIds = new Set(folderItems.map((item) => item.id));

    if (isChecked) {
      const selectedItemIds = new Set(selectedItems.map((item) => item.id));
      onChange([...selectedItems, ...folderItems.filter((item) => !selectedItemIds.has(item.id))]);
      return;
    }

    onChange(selectedItems.filter((item) => !folderItemIds.has(item.id)));
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col gap-3 p-4" aria-label="Loading accessible secrets">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={`copy-secret-tree-skeleton-${index + 1}`} className="h-8 w-full" />
          ))}
        </div>
      );
    }

    if (isError) {
      return (
        <Empty role="alert" className="min-h-64 border">
          <EmptyHeader>
            <EmptyTitle>Could Not Load Secrets</EmptyTitle>
            <EmptyDescription>
              The source secrets could not be loaded. Check your access and try again.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          </EmptyContent>
        </Empty>
      );
    }

    if (isInvalidPath) {
      return (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyTitle>Source Path Unavailable</EmptyTitle>
            <EmptyDescription>
              This path does not exist or you do not have access to its secrets. Choose another
              source path.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    if (isEmptyData) {
      return (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyTitle>No Accessible Secrets</EmptyTitle>
            <EmptyDescription>
              No secrets are available at this source path. Choose another path or environment.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    if (!data) return null;

    return (
      <ul aria-label={`Secrets under ${basePath}`}>
        <Folder
          basePath={basePath}
          name={basePath}
          structure={data}
          path="/"
          selectedItems={selectedItems}
          onItemSelect={handleItemSelect}
          onFolderSelect={handleFolderSelect}
          isExpanded
          level={0}
          isDisabled={isDisabled}
        />
      </ul>
    );
  };

  return (
    <div
      className={cn("w-full rounded-md border border-border bg-container", className)}
      aria-busy={isFetching || undefined}
    >
      <div className="max-h-[32vh] overflow-auto p-3">{renderContent()}</div>
      {!isLoading && !isError && !isInvalidPath && !isEmptyData && data && (
        <div className="flex justify-end border-t border-border px-3 py-2">
          <p className="text-xs text-muted" aria-live="polite">
            {selectedItems.length} {selectedItems.length === 1 ? "item" : "items"} selected
          </p>
        </div>
      )}
    </div>
  );
};
