import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TPkiSync, usePkiSyncOption } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync: TPkiSync;
};

export const PkiSyncPostSyncCommandSection = ({ pkiSync }: Props) => {
  const { syncOption } = usePkiSyncOption(pkiSync.destination);
  const { postSyncCommand } = pkiSync.syncOptions as { postSyncCommand?: string };

  if (!syncOption?.canRunPostSyncCommand) return null;

  return (
    <Detail>
      <DetailLabel>Post-Sync Command</DetailLabel>
      <DetailValue>
        {postSyncCommand ? (
          <pre className="max-h-32 thin-scrollbar overflow-auto rounded-sm bg-mineshaft-600 p-2 font-mono text-xs whitespace-pre-wrap text-foreground">
            {postSyncCommand}
          </pre>
        ) : (
          <span className="text-muted/50 italic">None</span>
        )}
      </DetailValue>
    </Detail>
  );
};
