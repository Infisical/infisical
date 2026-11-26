import { useMemo, useState } from "react";
import { ChevronRight, FolderIcon, TriangleAlert } from "lucide-react";

import {
  AnimatedCollapse,
  Badge,
  buildFileTree,
  Button,
  FileTreeNode,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { getSecretSyncRelativeFolder } from "@app/helpers/secretSyncs";
import {
  TSecretSyncRecursiveConflict,
  TSecretSyncRecursiveFolder
} from "@app/hooks/api/secretSyncs";

const MAX_COLLAPSED_ROWS = 8;

type Props = {
  secretPath: string;
  folders: TSecretSyncRecursiveFolder[];
  conflicts: TSecretSyncRecursiveConflict[];
  isLoading: boolean;
};

type TFolderRow = {
  path: string;
  name: string;
  depth: number;
  secretCount: number;
};

// The source folder and every folder below it that holds a synced secret, each right after its
// parent.
const getFolderRows = (secretPath: string, folders: TSecretSyncRecursiveFolder[]) => {
  const rootSegments = secretPath.split("/").filter(Boolean);
  const counts = new Map(
    folders.map(({ path, secretCount }) => [
      getSecretSyncRelativeFolder(path, secretPath),
      secretCount
    ])
  );
  const tree = buildFileTree([], [...counts.keys()].filter(Boolean));

  const rows: TFolderRow[] = [];
  const visit = (nodes: FileTreeNode[], row: Omit<TFolderRow, "secretCount">) => {
    rows.push({ ...row, secretCount: counts.get(row.path) ?? 0 });
    nodes.forEach((node) => {
      if (node.type === "folder") {
        visit(node.children, { path: node.path, name: node.name, depth: row.depth + 1 });
      }
    });
  };
  visit(tree, { path: "", name: `/${rootSegments.join("/")}`, depth: 0 });

  return rows;
};

export const SecretSyncSourceFolderTree = ({
  secretPath,
  folders,
  conflicts,
  isLoading
}: Props) => {
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const rows = useMemo(() => getFolderRows(secretPath, folders), [secretPath, folders]);
  const secretCount = rows.reduce((total, row) => total + row.secretCount, 0);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Spinner size="xs" />
        <p className="text-xs text-label">Loading folders...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-label">What will sync</p>
        <p className="text-xs text-muted">
          {secretCount} {secretCount === 1 ? "key" : "keys"} · {rows.length}{" "}
          {rows.length === 1 ? "folder" : "folders"}
        </p>
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        {conflicts.length > 0 && (
          <div className="border-b border-border">
            <div className="flex items-center gap-2 px-4 py-2 text-sm">
              <TriangleAlert className="size-4 shrink-0 text-warning" />
              <span>
                {conflicts.length === 1
                  ? "1 key exists in more than one folder"
                  : `${conflicts.length} keys exist in more than one folder`}
              </span>
              <Button
                variant="ghost"
                size="xs"
                className="ml-auto"
                onClick={() => setIsReviewOpen((prev) => !prev)}
                aria-expanded={isReviewOpen}
              >
                Review
                <ChevronRight className={isReviewOpen ? "rotate-90" : undefined} />
              </Button>
            </div>
            <AnimatedCollapse isOpen={isReviewOpen}>
              <div className="flex flex-col gap-2 px-4 pb-3 text-xs text-label">
                <p>
                  Turn on Preserve folder structure in the Destination step to keep each one at its
                  own path. To continue without preserving the folder structure, please resolve the
                  conflicts as listed below.
                </p>
                <ul className="flex flex-col gap-1.5">
                  {conflicts.map((conflict) => (
                    <li key={conflict.key}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="cursor-default text-left underline decoration-dotted underline-offset-2"
                          >
                            Secret key{" "}
                            <span className="font-mono font-semibold">{conflict.key}</span> is in{" "}
                            {conflict.paths.length} folders
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="start">
                          <p className="mb-1 text-muted">Found in</p>
                          <ul className="flex flex-col gap-0.5">
                            {conflict.paths.map((path) => (
                              <li key={path} className={path === "/" ? undefined : "font-mono"}>
                                {path === "/" ? "/ (Root folder)" : path}
                              </li>
                            ))}
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    </li>
                  ))}
                </ul>
              </div>
            </AnimatedCollapse>
          </div>
        )}
        {(isExpanded ? rows : rows.slice(0, MAX_COLLAPSED_ROWS)).map((folder) => (
          <div
            key={folder.path}
            className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm last:border-b-0"
            style={{ paddingLeft: `${16 + Math.max(folder.depth - 1, 0) * 20}px` }}
          >
            {folder.depth > 0 && <span className="text-muted">└</span>}
            <FolderIcon className="size-4 shrink-0 text-warning" />
            <span className="truncate font-mono">{folder.name}</span>
            {folder.depth === 0 && <Badge variant="warning">Sync Root</Badge>}
            <span className="ml-auto shrink-0 text-xs text-muted">
              {folder.secretCount} {folder.secretCount === 1 ? "secret" : "secrets"}
            </span>
          </div>
        ))}
        {rows.length > MAX_COLLAPSED_ROWS && (
          <div className="flex justify-center px-4 py-1.5">
            <Button variant="ghost" size="xs" onClick={() => setIsExpanded((prev) => !prev)}>
              {isExpanded ? "Show Fewer Folders" : `Show All ${rows.length} Folders`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
