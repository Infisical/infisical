import { useEffect, useState } from "react";

import { Sheet, SheetContent } from "@app/components/v3";
import { useGetFolderCommitsCount } from "@app/hooks/api/folderCommits/queries";

import { CommitDetailsView } from "./CommitDetailsView";
import { CommitHistoryView } from "./CommitHistoryView";
import { CommitRestoreView } from "./CommitRestoreView";

type View =
  | { name: "history" }
  | { name: "details"; commitId: string }
  | { name: "restore"; commitId: string };

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  /** Environment slug the history is scoped to. */
  environment: string;
  /** Environment display name, shown in the sheet header. */
  environmentName: string;
  secretPath: string;
};

export const CommitHistorySheet = ({
  isOpen,
  onOpenChange,
  projectId,
  environment,
  environmentName,
  secretPath
}: Props) => {
  const [view, setView] = useState<View>({ name: "history" });

  const { data: commitsCount } = useGetFolderCommitsCount({
    projectId,
    environment,
    directory: secretPath,
    isPaused: !isOpen
  });
  const folderId = commitsCount?.folderId;

  // Reopening on a different environment or path must not inherit the previous scope's view
  useEffect(() => {
    if (isOpen) setView({ name: "history" });
  }, [isOpen, environment, secretPath]);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full w-full flex-col gap-y-0 p-0 sm:max-w-5xl">
        {view.name === "history" && (
          <CommitHistoryView
            projectId={projectId}
            environment={environment}
            environmentName={environmentName}
            secretPath={secretPath}
            onSelectCommit={(commitId) => setView({ name: "details", commitId })}
          />
        )}

        {view.name === "details" && (
          <CommitDetailsView
            projectId={projectId}
            environment={environment}
            environmentName={environmentName}
            secretPath={secretPath}
            commitId={view.commitId}
            onBack={() => setView({ name: "history" })}
            onCommitReverted={() => setView({ name: "history" })}
            onGoToRestore={() => setView({ name: "restore", commitId: view.commitId })}
          />
        )}

        {view.name === "restore" && folderId && (
          <CommitRestoreView
            projectId={projectId}
            environment={environment}
            secretPath={secretPath}
            folderId={folderId}
            commitId={view.commitId}
            onBack={() => setView({ name: "details", commitId: view.commitId })}
            onRestored={() => setView({ name: "history" })}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
