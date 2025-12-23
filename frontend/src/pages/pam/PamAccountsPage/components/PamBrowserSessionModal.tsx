import { useEffect, useState } from "react";

import { Button, Modal, ModalContent, TextArea } from "@app/components/v2";
import {
  TPamBrowserSession,
  useCheckSessionHealth,
  useExecuteSessionQuery,
  useTerminateBrowserSession
} from "@app/hooks/api/pam";

import { PamQueryResultsTable } from "../../PamSessionsByIDPage/components/PamQueryResultsTable";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  session: TPamBrowserSession | null;
};

export const PamBrowserSessionModal = ({ isOpen, onOpenChange, session }: Props) => {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<any>(null);

  // Health check
  const { data: health } = useCheckSessionHealth(session?.sessionId || "", {
    refetchInterval: 30000,
    enabled: !!session?.sessionId && isOpen
  });

  // Mutations
  const { mutateAsync: executeQuery, isPending: isExecuting } = useExecuteSessionQuery();
  const { mutateAsync: terminateSession } = useTerminateBrowserSession();

  // Execute query handler
  const handleExecute = async () => {
    if (!session || !query.trim()) {
      return;
    }

    try {
      const queryResult = await executeQuery({ sessionId: session.sessionId, query: query.trim() });
      setResult(queryResult);
    } catch {
      // Silently fail - errors will be shown in the UI if needed
    }
  };

  // Auto-close modal when session expires
  useEffect(() => {
    if (health && !health.isAlive) {
      onOpenChange(false);
    }
  }, [health, onOpenChange]);

  // Terminate session when modal closes
  const handleClose = async () => {
    if (session?.sessionId) {
      try {
        await terminateSession({ sessionId: session.sessionId });
      } catch {
        // Ignore errors, session might already be terminated
      }
    }
    onOpenChange(false);
  };

  if (!session) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={handleClose}>
      <ModalContent
        className="max-h-[85vh] max-w-5xl"
        title={`${session.account.name} - Browser Session`}
        subTitle={`Database: ${session.metadata.database}`}
      >
        {/* Query Editor */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium text-mineshaft-300">SQL Query</div>
            <TextArea
              value={query}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setQuery(e.target.value)}
              placeholder="SELECT * FROM users LIMIT 10;"
              className="min-h-[150px] border-mineshaft-600 bg-mineshaft-900 font-mono text-bunker-100"
              isDisabled={isExecuting}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              onClick={handleExecute}
              isLoading={isExecuting}
              isDisabled={!query.trim() || isExecuting}
              size="sm"
              colorSchema="secondary"
              leftIcon={<span>▶</span>}
            >
              Execute Query
            </Button>
          </div>

          {/* Results */}
          {result && (
            <div className="mt-4 flex flex-col gap-3">
              <div className="flex items-center justify-between border-t border-mineshaft-600 pt-3 text-sm text-bunker-400">
                <span className="font-medium">
                  {result.rowCount} {result.rowCount === 1 ? "row" : "rows"} returned
                </span>
                <span>Executed in {result.executionTimeMs}ms</span>
              </div>
              <div className="max-h-[400px] overflow-auto">
                <PamQueryResultsTable rows={result.rows} rowCount={result.rowCount} />
              </div>
            </div>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
};
