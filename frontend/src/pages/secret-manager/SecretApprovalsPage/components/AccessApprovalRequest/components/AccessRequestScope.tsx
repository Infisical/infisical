import { type ReactNode, useMemo, useState } from "react";
import { ChevronRightIcon, FolderIcon, FolderOpenIcon } from "lucide-react";
import picomatch from "picomatch";

import { cn } from "@app/components/v3/utils";
import { useProject } from "@app/context";
import { useListProjectEnvironmentsFolders } from "@app/hooks/api/secretFolders/queries";

import { buildFolderTree, type FolderTreeNode, isGlobPath } from "../AccessApprovalRequest.utils";

const ROW_PADDING_PX = 8;
const INDENT_PX = 12;
const CHEVRON_PX = 18;

// A glob also covers folders created later, so the folders listed under it are today's matches,
// not the full grant.
export const AccessRequestScope = ({
  secretPath,
  environment
}: {
  secretPath: string;
  environment: string;
}) => {
  const { currentProject } = useProject();
  const [openOverrides, setOpenOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());
  const isGlob = isGlobPath(secretPath);
  const { data: environmentFolders, isError } = useListProjectEnvironmentsFolders(
    currentProject.id,
    {
      environment,
      enabled: isGlob
    }
  );

  const folderTree = useMemo(() => {
    if (!isGlob) return [];
    const isMatch = picomatch(secretPath, { strictSlashes: false });
    return buildFolderTree(
      (environmentFolders?.[environment]?.folders ?? [])
        .map((folder) => folder.path)
        .filter((path) => isMatch(path))
    );
  }, [isGlob, environmentFolders, environment, secretPath]);

  const renderNodes = (nodes: FolderTreeNode[], depth: number): ReactNode =>
    nodes.map((node) => {
      const paddingLeft = ROW_PADDING_PX + depth * INDENT_PX;
      const label = (
        <span className="truncate font-mono text-xs" title={node.path}>
          {node.label}
        </span>
      );

      if (!node.children.length) {
        return (
          <li
            key={node.path}
            className="flex h-7 items-center gap-1 pr-2 text-label"
            style={{ paddingLeft: paddingLeft + CHEVRON_PX }}
          >
            <FolderIcon className="size-3.5 shrink-0 text-folder" />
            {label}
          </li>
        );
      }

      // A lone top-level group starts open, so a path such as "/aws/**" lists more than one closed row.
      const isOpen = openOverrides.get(node.path) ?? (depth === 0 && nodes.length === 1);
      const Icon = isOpen ? FolderOpenIcon : FolderIcon;
      return (
        <li key={node.path}>
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => setOpenOverrides((prev) => new Map(prev).set(node.path, !isOpen))}
            className="flex h-7 w-full cursor-pointer items-center gap-1 rounded-md pr-2 text-left text-label outline-none hover:bg-container-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            style={{ paddingLeft }}
          >
            <ChevronRightIcon
              className={cn(
                "size-3.5 shrink-0 text-muted transition-transform",
                isOpen && "rotate-90"
              )}
            />
            <Icon className="size-3.5 shrink-0 text-folder" />
            {label}
          </button>
          {isOpen && <ul>{renderNodes(node.children, depth + 1)}</ul>}
        </li>
      );
    });

  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border bg-container">
      <div className="flex items-center gap-2 px-3 py-2">
        <FolderOpenIcon className="size-3.5 shrink-0 text-folder" />
        <span className="truncate font-mono text-sm">{secretPath}</span>
      </div>
      {folderTree.length > 0 && (
        <ul className="max-h-64 thin-scrollbar overflow-y-auto border-t border-border p-1">
          {renderNodes(folderTree, 0)}
        </ul>
      )}
      {isGlob && isError && (
        <p className="border-t border-border px-3 py-2 text-xs text-muted">
          Couldn&apos;t load the folders this path matches.
        </p>
      )}
    </div>
  );
};
