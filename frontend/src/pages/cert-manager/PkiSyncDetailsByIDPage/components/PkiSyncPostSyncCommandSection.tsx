import { TPkiSync, usePkiSyncOption } from "@app/hooks/api/pkiSyncs";

import { HostCommandDetail } from "./HostCommandDetail";

type Props = {
  pkiSync: TPkiSync;
};

export const PkiSyncPostSyncCommandSection = ({ pkiSync }: Props) => {
  const { syncOption } = usePkiSyncOption(pkiSync.destination);
  const { postSyncCommand } = pkiSync.syncOptions as { postSyncCommand?: string };

  if (!syncOption?.canRunPostSyncCommand) return null;

  return (
    <HostCommandDetail
      label="Post-Sync Command"
      command={postSyncCommand}
      showCommandLabel="Show command"
      dialogDescription="Runs on the destination host after this sync delivers a certificate."
    />
  );
};
