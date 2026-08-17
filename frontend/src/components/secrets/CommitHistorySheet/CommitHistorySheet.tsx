import { useEffect, useState } from "react";

import { Sheet, SheetContent } from "@app/components/v3";

import { CommitDetailsView } from "./CommitDetailsView";
import { CommitHistoryView } from "./CommitHistoryView";
import { CommitRestoreView } from "./CommitRestoreView";

type View =
  | { name: "history" }
  | { name: "details"; commitId: string; folderId: string }
  | { name: "restore"; commitId: string; folderId: string };

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
            onSelectCommit={(commitId, folderId) =>
              setView({ name: "details", commitId, folderId })
            }
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
            onGoToRestore={() =>
              setView({ name: "restore", commitId: view.commitId, folderId: view.folderId })
            }
          />
        )}

        {view.name === "restore" && (
          <CommitRestoreView
            projectId={projectId}
            environment={environment}
            secretPath={secretPath}
            folderId={view.folderId}
            commitId={view.commitId}
            onBack={() =>
              setView({ name: "details", commitId: view.commitId, folderId: view.folderId })
            }
            onRestored={() => setView({ name: "history" })}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
