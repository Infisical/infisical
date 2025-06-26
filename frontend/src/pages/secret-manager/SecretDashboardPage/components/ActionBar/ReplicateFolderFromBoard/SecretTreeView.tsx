import React, { useEffect, useMemo, useState } from "react";
import {
  faChevronDown,
  faChevronRight,
  faFolder,
  faFolderOpen,
  faFolderTree,
  faKey
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

import { Checkbox } from "@app/components/v2";

interface SecretItem {
  id?: string;
  secretKey?: string;
  secretValue?: string;
  secretPath?: string;
  [key: string]: any;
}

interface FolderStructure {
  items: SecretItem[];
  subFolders: {
    [key: string]: FolderStructure;
  };
}

interface TreeData {
  [key: string]: FolderStructure | null;
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
  basePath?: string;
  isDisabled?: boolean;
}

interface TreeViewProps {
  data: FolderStructure | null;
  basePath?: string;
  className?: string;
  onChange: (items: SecretItem[]) => void;
  isDisabled?: boolean;
}

const getAllItemsInFolder = (folder: FolderStructure): SecretItem[] => {
  let items: SecretItem[] = [];

  items = items.concat(folder.items);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Object.entries(folder.subFolders).forEach(([_, subFolder]) => {
    items = items.concat(getAllItemsInFolder(subFolder));
  });

  return items;
};

const getDisplayName = (name: string): string => {
  const parts = name.split("/");
  return parts[parts.length - 1];
};

const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
const CollapsibleContent = CollapsiblePrimitive.Content;

const Folder: React.FC<FolderProps> = ({
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
}) => {
  const [open, setOpen] = useState(isExpanded);
  const displayName = useMemo(() => getDisplayName(name), [name]);

  const allItems = useMemo(() => getAllItemsInFolder(structure), [structure]);
  const allItemIds = useMemo(() => allItems.map((item) => item.id), [allItems]);
  const selectedItemIds = useMemo(() => selectedItems.map((item) => item.id), [selectedItems]);
  const allSelected = useMemo(
    () => allItemIds.length > 0 && allItemIds.every((id) => selectedItemIds.includes(id)),
    [allItemIds, selectedItemIds]
  );
  const someSelected = useMemo(
    () => allItemIds.some((id) => selectedItemIds.includes(id)) && !allSelected,
    [allItemIds, selectedItemIds, allSelected]
  );
  const hasContents = structure.items.length > 0 || Object.keys(structure.subFolders).length > 0;

  const handleFolderSelect = (checked: boolean) => {
    onFolderSelect(path, checked);
  };

  return (
    <div className={`folder-container ml-${level > 0 ? "4" : 0}`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="group flex items-center rounded px-2 py-1">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="mr-1 flex h-6 w-6 items-center justify-center rounded focus:outline-none"
              disabled={!hasContents}
              aria-label={open ? "Collapse folder" : "Expand folder"}
            >
              {hasContents && (
                <FontAwesomeIcon icon={open ? faChevronDown : faChevronRight} className="h-3 w-3" />
              )}
            </button>
          </CollapsibleTrigger>

          <div className="mr-2">
            <FontAwesomeIcon
              // eslint-disable-next-line no-nested-ternary
              icon={level > 0 ? (open ? faFolderOpen : faFolder) : faFolderTree}
              className={`h-4 w-4 text-${level === 0 ? "mineshaft-300" : "yellow"}`}
            />
          </div>
          {!isDisabled && (
            <Checkbox
              id="folder-root"
              isChecked={allSelected || someSelected}
              onCheckedChange={handleFolderSelect}
              isIndeterminate={someSelected && !allSelected}
              isDisabled={isDisabled}
            />
          )}

          <label
            htmlFor={`folder-${path}`}
            className={`ml-2 flex-1 cursor-pointer truncate ${basePath ? "italic text-mineshaft-300" : ""}`}
            title={displayName}
          >
            {displayName || `${basePath}`}
          </label>

          {allItemIds.length > 0 && (
            <span className="ml-2 text-xs text-mineshaft-400">
              {allItemIds.length} {allItemIds.length === 1 ? "item" : "items"}
            </span>
          )}
        </div>

        <CollapsibleContent className="overflow-hidden transition-all duration-300 ease-in-out">
          <div className="relative mt-1">
            <div className="absolute bottom-0 left-5 top-0 w-px bg-mineshaft-600" />
            {structure.items.map((item) => (
              <div key={item.id} className="group ml-6 flex items-center rounded px-2 py-1">
                <div className="ml-6 mr-2">
                  <FontAwesomeIcon icon={faKey} className="h-3 w-3" />
                </div>
                {!isDisabled && (
                  <Checkbox
                    id={`folder-${item.id}`}
                    isChecked={selectedItemIds.includes(item.id)}
                    onCheckedChange={(checked) => onItemSelect(item, !!checked)}
                    isDisabled={isDisabled}
                  />
                )}
                <label
                  htmlFor={item.id}
                  className="ml-2 flex-1 cursor-pointer truncate"
                  title={item.secretKey}
                >
                  {item.secretKey}
                </label>
              </div>
            ))}

            {Object.entries(structure.subFolders).map(([subName, subStructure]) => (
              <Folder
                key={subName}
                name={subName}
                structure={subStructure}
                path={path ? `${path}/${subName}` : subName}
                selectedItems={selectedItems}
                onItemSelect={onItemSelect}
                onFolderSelect={onFolderSelect}
                level={level + 1}
                isDisabled={isDisabled}
              />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export const SecretTreeView: React.FC<TreeViewProps> = ({
  data,
  basePath = "/",
  className = "",
  onChange,
  isDisabled = false
}) => {
  const [selectedItems, setSelectedItems] = useState<SecretItem[]>([]);
  const rootPath = "/";
  const treeData: TreeData = data ? { [rootPath]: data as FolderStructure } : { [rootPath]: null };

  const rootFolders = useMemo(() => {
    return Object.entries(treeData);
  }, [treeData]);

  const isEmptyData = useMemo(() => {
    return (
      !data || (typeof data === "object" && Object.keys(data).length === 0) || !rootFolders.length
    );
  }, [data, rootFolders]);

  const handleItemSelect = (item: SecretItem, isChecked: boolean) => {
    if (isChecked) {
      setSelectedItems((prev) => [...prev, item]);
    } else {
      setSelectedItems((prev) => prev.filter((i) => i.id !== item.id));
    }
  };

  const handleFolderSelect = (folderPath: string, isChecked: boolean) => {
    const getFolderFromPath = (tree: TreeData, path: string): FolderStructure | null => {
      if (rootFolders.length === 1 && rootFolders[0][0] === path) {
        return rootFolders[0][1];
      }

      let adjustedPath = path;
      if (!path.startsWith(rootPath)) {
        adjustedPath = rootPath === path ? rootPath : `${rootPath}/${path}`;
      }

      if (adjustedPath === "/") return tree["/"];

      const parts = adjustedPath.split("/").filter((p) => p !== "");

      let current: any;
      current = tree["/"];

      const targetExists = parts.every((part) => {
        if (current?.subFolders?.[part]) {
          current = current.subFolders[part];
          return true;
        }
        return false;
      });

      if (!targetExists) {
        return null;
      }

      return current;
    };

    const folder = getFolderFromPath(treeData, folderPath);
    if (!folder) return;

    const folderItems = getAllItemsInFolder(folder);
    const folderItemIds = folderItems.map((item) => item.id);

    if (isChecked) {
      setSelectedItems((prev) => {
        const prevIds = prev.map((item) => item.id);
        const newItems = [...prev];
        folderItems.forEach((item) => {
          if (!prevIds.includes(item.id)) {
            newItems.push(item);
          }
        });
        return newItems;
      });
    } else {
      setSelectedItems((prev) => prev.filter((item) => !folderItemIds.includes(item.id)));
    }
  };

  useEffect(() => {
    setSelectedItems([]);
  }, [data]);

  useEffect(() => {
    onChange(selectedItems);
  }, [selectedItems]);

  return (
    <div className="flex w-full items-start gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900">
      <div className={`w-full rounded-lg shadow-sm ${className}`}>
        <div className="h-[25vh] overflow-auto p-3">
          {isEmptyData ? (
            <div className="flex h-full w-full items-center justify-center text-center text-mineshaft-300">
              <p>No secrets or folders available</p>
            </div>
          ) : (
            rootFolders.map(([folderName, folderStructure]) => (
              <Folder
                basePath={basePath}
                key={folderName}
                name={folderName}
                structure={folderStructure || { items: [], subFolders: {} }}
                path={folderName}
                selectedItems={selectedItems}
                onItemSelect={handleItemSelect}
                onFolderSelect={handleFolderSelect}
                isExpanded
                level={0}
                isDisabled={isDisabled}
              />
            ))
          )}
        </div>

        {!isDisabled && (
          <div className="flex justify-end pb-2 pr-2 pt-2">
            <h3 className="flex items-center text-mineshaft-400">
              {selectedItems.length} Item{selectedItems.length === 1 ? "" : "s"} Selected
            </h3>
          </div>
        )}
      </div>
    </div>
  );
};
