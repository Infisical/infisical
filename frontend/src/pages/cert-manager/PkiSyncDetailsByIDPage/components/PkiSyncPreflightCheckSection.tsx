import { TPkiSync, usePkiSyncOption } from "@app/hooks/api/pkiSyncs";

import { HostCommandDetail } from "./HostCommandDetail";

type Props = {
  pkiSync: TPkiSync;
};

export const PkiSyncPreflightCheckSection = ({ pkiSync }: Props) => {
  const { syncOption } = usePkiSyncOption(pkiSync.destination);
  const { preflightCommand } = pkiSync.syncOptions as { preflightCommand?: string };

  if (!syncOption?.canRunPreflightCommand) return null;

  return (
    <HostCommandDetail
      label="Preflight Check"
      command={preflightCommand}
      showCommandLabel="Show check"
      dialogDescription="Runs on the destination host before this sync delivers anything. A non-zero exit stops the sync."
    />
  );
};
