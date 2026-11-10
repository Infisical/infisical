import { useMemo, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, CornerDownRightIcon, FolderOpenIcon } from "lucide-react";
import picomatch from "picomatch";

import { Button } from "@app/components/v3";
import { useProject } from "@app/context";
import { useListProjectEnvironmentsFolders } from "@app/hooks/api/secretFolders/queries";

import { isGlobPath } from "../AccessApprovalRequest.utils";

const COLLAPSED_FOLDER_COUNT = 5;

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
  const [isExpanded, setIsExpanded] = useState(false);
  const isGlob = isGlobPath(secretPath);
  const { data: environmentFolders } = useListProjectEnvironmentsFolders(currentProject.id, {
    environment,
    enabled: isGlob
  });

  const matchingFolders = useMemo(() => {
    if (!isGlob) return [];
    const isMatch = picomatch(secretPath, { strictSlashes: false });
    return (environmentFolders?.[environment]?.folders ?? [])
      .map((folder) => folder.path)
      .filter((path) => isMatch(path))
      .sort((a, b) => a.localeCompare(b));
  }, [isGlob, environmentFolders, environment, secretPath]);

  const hiddenCount = matchingFolders.length - COLLAPSED_FOLDER_COUNT;
  const visibleFolders = isExpanded
    ? matchingFolders
    : matchingFolders.slice(0, COLLAPSED_FOLDER_COUNT);

  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border bg-container">
      <div className="flex items-center gap-2 px-3 py-2">
        <FolderOpenIcon className="size-3.5 shrink-0 text-folder" />
        <span className="truncate font-mono text-sm">{secretPath}</span>
      </div>
      {visibleFolders.length > 0 && (
        <div className="flex flex-col border-t border-border py-1">
          {visibleFolders.map((path) => (
            <div key={path} className="flex h-7 items-center gap-2 pr-3 pl-9">
              <CornerDownRightIcon className="size-3 shrink-0 text-muted" />
              <span className="truncate font-mono text-xs text-label">{path}</span>
            </div>
          ))}
        </div>
      )}
      {hiddenCount > 0 && (
        <div className="border-t border-border p-1">
          <Button variant="ghost" size="xs" onClick={() => setIsExpanded((prev) => !prev)}>
            {isExpanded ? "Show Fewer Folders" : `Show ${hiddenCount} More Folders`}
            {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </Button>
        </div>
      )}
    </div>
  );
};
