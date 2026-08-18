import { useFormContext } from "react-hook-form";

import { PREFLIGHT_COMMAND_VARIABLE_DESCRIPTIONS } from "@app/helpers/pkiSyncs";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { HostCommandField } from "./HostCommandField";

const COMMAND_PLACEHOLDERS: Partial<Record<PkiSync, string>> = {
  [PkiSync.LinuxServer]: "test -w {{certificateDirectory}} && systemctl is-active nginx",
  [PkiSync.WindowsServer]:
    'if (-not (Test-Path {{certificateDirectory}})) { throw "destination directory is missing" }'
};

type Props = {
  destination?: PkiSync;
  canEditCommand?: boolean;
};

export const PkiSyncPreflightCommandFields = ({ destination, canEditCommand }: Props) => {
  const { watch } = useFormContext<TPkiSyncForm>();

  return (
    <HostCommandField
      name="syncOptions.preflightCommand"
      id="preflight-command"
      label="Preflight check"
      descriptions={PREFLIGHT_COMMAND_VARIABLE_DESCRIPTIONS}
      placeholder={COMMAND_PLACEHOLDERS[destination ?? watch("destination")]}
      canEditCommand={canEditCommand}
      tooltipFooter={
        <>
          Type <span className="font-mono">{"{{"}</span> in the command to pick one. The paths
          describe the files this run is about to write, so a check can look at where a certificate
          is going before it goes there. Each variable is inserted already quoted, so do not wrap
          one in quotes yourself.
        </>
      }
      description="Runs before any certificate is written. A non-zero exit stops the sync, so nothing is delivered to a host that is not ready. Also runs once a day on its own, so you hear about a host that went bad before the next renewal does. Capped at 10 seconds."
      noPermissionDescription="You do not have permission to set a preflight check on this sync. Ask an administrator to change it."
    />
  );
};
