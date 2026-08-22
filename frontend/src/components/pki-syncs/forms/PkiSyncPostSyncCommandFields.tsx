import { useFormContext } from "react-hook-form";

import { POST_SYNC_COMMAND_VARIABLE_DESCRIPTIONS } from "@app/helpers/pkiSyncs";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { HostCommandField } from "./HostCommandField";

const COMMAND_PLACEHOLDERS: Partial<Record<PkiSync, string>> = {
  [PkiSync.LinuxServer]: "cp {{certificatePath}} /etc/nginx/ssl/live.pem && systemctl reload nginx",
  [PkiSync.WindowsServer]: 'Restart-Service -Name "W3SVC"'
};

type Props = {
  destination?: PkiSync;
  canEditCommand?: boolean;
};

export const PkiSyncPostSyncCommandFields = ({ destination, canEditCommand }: Props) => {
  const { watch } = useFormContext<TPkiSyncForm>();

  return (
    <HostCommandField
      name="syncOptions.postSyncCommand"
      id="post-sync-command"
      label="Post-sync command"
      descriptions={POST_SYNC_COMMAND_VARIABLE_DESCRIPTIONS}
      placeholder={COMMAND_PLACEHOLDERS[destination ?? watch("destination")]}
      canEditCommand={canEditCommand}
      tooltipFooter={
        <>
          Type <span className="font-mono">{"{{"}</span> in the command to pick one. Each variable
          is replaced with its value before the command is sent to the host, and is inserted already
          quoted, so do not wrap one in quotes yourself. Do not paste secrets into the command.
        </>
      }
      description="Runs after the sync delivers a certificate, for example to reload the service that uses it. Runs once per sync run that delivers a file, as the sync's account, so keep that account least-privilege. If it fails, the sync is marked failed."
      noPermissionDescription="You do not have permission to set a post-sync command on this sync. Ask an administrator to change it."
    />
  );
};
