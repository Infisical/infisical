import { type MouseEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { ChevronRightIcon, FileTextIcon, FolderIcon, FolderOpenIcon } from "lucide-react";

import { cn } from "../../utils";
import { buildFileTree, type FileTreeNode, getAncestorFolders } from "./file-tree";

type FileTreeItemType = FileTreeNode["type"];

/** A row whose name is being typed: a new item at the top of a folder, or an existing item being renamed. */
type FileTreeInlineEdit =
  | { action: "create"; type: FileTreeItemType; parentPath: string }
  | { action: "rename"; type: FileTreeItemType; path: string };

type FileTreeProps = {
  /** Slash-separated file paths. Folders are derived from them. */
  paths: readonly string[];
  /** Folders to show even though no file is in them. */
  folders?: readonly string[];
  selectedPath?: string | null;
  onSelect?: (path: string) => void;
  /** Shown after a file's name, such as a status dot or a badge. */
  renderIndicator?: (path: string) => ReactNode;
  /** Controls for a file or folder, shown at the end of its row while the row is hovered or focused. */
  renderActions?: (path: string, type: FileTreeItemType) => ReactNode;
  onItemContextMenu?: (event: MouseEvent, path: string, type: FileTreeItemType) => void;
  /** Right-click on the tree's empty space, outside any row. */
  onBackgroundContextMenu?: (event: MouseEvent) => void;
  inlineEdit?: FileTreeInlineEdit | null;
  /** The input shown in place of the name of the row in `inlineEdit`. */
  renderInlineEdit?: () => ReactNode;
  footer?: ReactNode;
  className?: string;
  "aria-label"?: string;
};

const ROW_CLASSNAME =
  "group/file-tree-row flex h-7 min-w-0 items-center gap-1 rounded-md pr-1 text-sm text-label hover:bg-container-hover hover:text-foreground";

const INDENT_PX = 12;
const CHEVRON_PX = 18;

const getFolderPathsToOpen = (inlineEdit?: FileTreeInlineEdit | null) => {
  if (!inlineEdit) return [];
  if (inlineEdit.action === "create") {
    return inlineEdit.parentPath
      ? [...getAncestorFolders(inlineEdit.parentPath), inlineEdit.parentPath]
      : [];
  }
  return getAncestorFolders(inlineEdit.path);
};

const FileTree = ({
  paths,
  folders,
  selectedPath,
  onSelect,
  renderIndicator,
  renderActions,
  onItemContextMenu,
  onBackgroundContextMenu,
  inlineEdit,
  renderInlineEdit,
  footer,
  className,
  "aria-label": ariaLabel = "Files"
}: FileTreeProps) => {
  const tree = useMemo(() => buildFileTree(paths, folders), [paths, folders]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const expand = (toOpen: string[]) =>
    setCollapsed((prev) =>
      toOpen.some((folder) => prev.has(folder))
        ? new Set([...prev].filter((folder) => !toOpen.includes(folder)))
        : prev
    );

  useEffect(() => {
    if (selectedPath) expand(getAncestorFolders(selectedPath));
  }, [selectedPath]);

  useEffect(() => {
    expand(getFolderPathsToOpen(inlineEdit));
  }, [inlineEdit]);

  const toggleFolder = (path: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderEditRow = (key: string, type: FileTreeItemType, depth: number) => {
    const Icon = type === "folder" ? FolderIcon : FileTextIcon;
    return (
      <li
        key={key}
        className="flex min-w-0 items-start gap-1 py-0.5 pr-1"
        style={{ paddingLeft: 4 + depth * INDENT_PX + CHEVRON_PX }}
      >
        <Icon aria-hidden className="mt-2 size-3.5 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">{renderInlineEdit?.()}</div>
      </li>
    );
  };

  const renderActionSlot = (path: string, type: FileTreeItemType) => {
    const actions = renderActions?.(path, type);
    if (!actions) return null;
    return (
      <div className="flex shrink-0 items-center opacity-0 group-focus-within/file-tree-row:opacity-100 group-hover/file-tree-row:opacity-100 has-[[data-state=open]]:opacity-100">
        {actions}
      </div>
    );
  };

  const renderNodes = (nodes: FileTreeNode[], depth: number, parentPath: string): ReactNode => {
    const createRow =
      inlineEdit?.action === "create" && inlineEdit.parentPath === parentPath
        ? renderEditRow(`create:${parentPath}`, inlineEdit.type, depth)
        : null;

    const rows = nodes.map((node) => {
      const paddingLeft = 4 + depth * INDENT_PX;
      const isRenaming = inlineEdit?.action === "rename" && inlineEdit.path === node.path;
      const onContextMenu = onItemContextMenu
        ? (event: MouseEvent) => {
            event.stopPropagation();
            onItemContextMenu(event, node.path, node.type);
          }
        : undefined;

      if (node.type === "folder") {
        const isOpen = !collapsed.has(node.path);
        const children = isOpen ? renderNodes(node.children, depth + 1, node.path) : null;
        if (isRenaming) {
          return (
            <li key={`folder:${node.path}`}>
              <ul>{renderEditRow(`rename:${node.path}`, "folder", depth)}</ul>
              {children && <ul>{children}</ul>}
            </li>
          );
        }
        const Icon = isOpen ? FolderOpenIcon : FolderIcon;
        return (
          <li key={`folder:${node.path}`}>
            <div className={ROW_CLASSNAME} onContextMenu={onContextMenu}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggleFolder(node.path)}
                className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ paddingLeft }}
              >
                <ChevronRightIcon
                  aria-hidden
                  className={cn(
                    "size-3.5 shrink-0 text-muted transition-transform",
                    isOpen && "rotate-90"
                  )}
                />
                <Icon aria-hidden className="size-3.5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate font-mono text-xs" title={node.path}>
                  {node.name}
                </span>
              </button>
              {renderActionSlot(node.path, "folder")}
            </div>
            {children && <ul>{children}</ul>}
          </li>
        );
      }

      if (isRenaming) return renderEditRow(`rename:${node.path}`, "file", depth);

      const isSelected = node.path === selectedPath;
      return (
        <li
          key={`file:${node.path}`}
          className={cn(ROW_CLASSNAME, isSelected && "bg-container-hover text-foreground")}
          onContextMenu={onContextMenu}
        >
          <button
            type="button"
            aria-current={isSelected || undefined}
            onClick={() => onSelect?.(node.path)}
            className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ paddingLeft: paddingLeft + CHEVRON_PX }}
          >
            <FileTextIcon aria-hidden className="size-3.5 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={node.path}>
              {node.name}
            </span>
            {renderIndicator?.(node.path)}
          </button>
          {renderActionSlot(node.path, "file")}
        </li>
      );
    });

    return createRow ? [createRow, ...rows] : rows;
  };

  return (
    <nav
      aria-label={ariaLabel}
      data-slot="file-tree"
      className={cn("flex min-h-0 min-w-0 flex-col", className)}
      onContextMenu={onBackgroundContextMenu}
    >
      <ul className="min-h-0 thin-scrollbar flex-1 overflow-y-auto">{renderNodes(tree, 0, "")}</ul>
      {footer && <div className="shrink-0 pt-1">{footer}</div>}
    </nav>
  );
};

export { FileTree, type FileTreeInlineEdit, type FileTreeItemType, type FileTreeProps };
