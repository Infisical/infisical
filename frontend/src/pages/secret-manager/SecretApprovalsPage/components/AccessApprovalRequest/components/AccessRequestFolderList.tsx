import { useMemo, useState } from "react";
import { FolderIcon, TriangleAlertIcon } from "lucide-react";
import picomatch from "picomatch";

import { Alert, AlertDescription, Button } from "@app/components/v3";
import { useProject } from "@app/context";
import { useListProjectEnvironmentsFolders } from "@app/hooks/api/secretFolders/queries";

import { ENTIRE_SCOPE_PATH } from "../AccessApprovalRequest.utils";

const COLLAPSED_FOLDER_COUNT = 5;

// The folders a glob path covers right now. A glob also covers folders created later, so this is a
// preview of today's folders, not the full grant.
export const AccessRequestFolderList = ({
  secretPath,
  environment
}: {
  secretPath: string;
  environment: string;
}) => {
  const { currentProject } = useProject();
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: environmentFolders, isPending } = useListProjectEnvironmentsFolders(
    currentProject.id,
    { environment }
  );

  const matchingFolders = useMemo(() => {
    const isMatch = picomatch(secretPath, { strictSlashes: false });
    return (environmentFolders?.[environment]?.folders ?? [])
      .map((folder) => folder.path)
      .filter((path) => isMatch(path))
      .sort((a, b) => a.localeCompare(b));
  }, [environmentFolders, environment, secretPath]);

  if (isPending) return null;

  const environmentName =
    currentProject.environments.find((env) => env.slug === environment)?.name ?? environment;
  const hiddenCount = matchingFolders.length - COLLAPSED_FOLDER_COUNT;
  const visibleFolders = isExpanded
    ? matchingFolders
    : matchingFolders.slice(0, COLLAPSED_FOLDER_COUNT);

  return (
    <div className="flex flex-col gap-2">
      {secretPath === ENTIRE_SCOPE_PATH && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>
            Grants every folder in {environmentName}, including folders created later.
          </AlertDescription>
        </Alert>
      )}
      {matchingFolders.length ? (
        <div className="flex flex-col overflow-hidden rounded-md border border-border">
          {visibleFolders.map((path) => (
            <div
              key={path}
              className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-sm last:border-b-0"
            >
              <FolderIcon className="size-3.5 shrink-0 text-warning" />
              <span className="truncate">{path}</span>
            </div>
          ))}
          {hiddenCount > 0 && (
            <Button
              variant="ghost"
              size="xs"
              className="justify-start rounded-none px-3 text-muted"
              onClick={() => setIsExpanded((prev) => !prev)}
            >
              {isExpanded ? "Show Fewer" : `Show ${hiddenCount} More`}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted">No folders match this path right now.</p>
      )}
    </div>
  );
};
