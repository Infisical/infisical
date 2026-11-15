import { POST_SYNC_COMMAND_VARIABLE_DESCRIPTIONS } from "@app/helpers/pkiSyncs";
import { PkiSync } from "@app/hooks/api/pkiSyncs/enums";

import { useWatchedValue } from "../fields";
import { HostCommandField } from "./host-command-field";

const COMMAND_PLACEHOLDERS: Partial<Record<PkiSync, string>> = {
  [PkiSync.LinuxServer]: "cp {{certificatePath}} /etc/nginx/ssl/live.pem && systemctl reload nginx",
  [PkiSync.WindowsServer]: 'Restart-Service -Name "W3SVC"'
};

export function PkiSyncPostSyncCommandFields({
  destination,
  canEditCommand
}: {
  destination?: PkiSync;
  canEditCommand?: boolean;
}) {
  const watchedDestination = useWatchedValue<PkiSync>("destination");
  return (
    <HostCommandField
      name="syncOptions.postSyncCommand"
      label="Post-sync command"
      descriptions={POST_SYNC_COMMAND_VARIABLE_DESCRIPTIONS}
      placeholder={COMMAND_PLACEHOLDERS[destination ?? watchedDestination]}
      canEditCommand={canEditCommand}
      tooltipFooter="Type {{ in the command to pick one. Each variable is replaced with its value before the command is sent to the host, and is inserted already quoted, so do not wrap one in quotes yourself. Do not paste secrets into the command."
      description="Runs on the host after a certificate is delivered, usually to reload the service that uses it. Runs once per sync that writes a file, using the sync's own account. If it fails, or does not finish within 30 seconds, the sync is marked failed."
      noPermissionDescription="You do not have permission to set a post-sync command on this sync. Ask an administrator to change it."
    />
  );
}
