import { useFormContext } from "react-hook-form";

import { createNotification } from "@app/components/notifications";
import { Button } from "@app/components/v3";
import { HEALTH_CHECK_COMMAND_VARIABLE_DESCRIPTIONS } from "@app/helpers/pkiSyncs";
import { PkiSync, PkiSyncStatus, useTestPkiSyncHealthCheck } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { notifyUnhandledHostCommandError } from "./hostCommandErrors";
import { HostCommandField } from "./HostCommandField";

const COMMAND_PLACEHOLDERS: Partial<Record<PkiSync, string>> = {
  [PkiSync.LinuxServer]: "test -w {{certificateDirectory}} && systemctl is-active nginx",
  [PkiSync.WindowsServer]:
    'if (-not (Test-Path {{certificateDirectory}})) { throw "destination directory is missing" }'
};

type Props = {
  destination?: PkiSync;
  applicationId?: string | null;
  syncId?: string;
  canEditCommand?: boolean;
};

export const PkiSyncHealthCheckCommandFields = ({
  destination,
  applicationId,
  syncId,
  canEditCommand
}: Props) => {
  const { watch } = useFormContext<TPkiSyncForm>();
  const testHealthCheck = useTestPkiSyncHealthCheck();

  const effectiveDestination = destination ?? watch("destination");
  const command = watch("syncOptions.healthCheckCommand");
  const connectionId = watch("connection.id");
  const destinationConfig = watch("destinationConfig");

  const handleTest = async () => {
    try {
      const result = await testHealthCheck.mutateAsync({
        destination: effectiveDestination,
        connectionId,
        applicationId: applicationId ?? undefined,
        syncId,
        destinationConfig: (destinationConfig ?? {}) as Record<string, unknown>,
        syncOptions: { healthCheckCommand: command }
      });
      const passed = result.status === PkiSyncStatus.Succeeded;
      createNotification({
        title: passed ? "Health check passed" : "Health check failed",
        text:
          result.output || result.failureDetail || result.message || "The host reported no output.",
        type: passed ? "success" : "error"
      });
    } catch (error) {
      notifyUnhandledHostCommandError(error, "Could not run the health check");
    }
  };

  return (
    <HostCommandField
      name="syncOptions.healthCheckCommand"
      id="health-check-command"
      label="Health check"
      descriptions={HEALTH_CHECK_COMMAND_VARIABLE_DESCRIPTIONS}
      placeholder={COMMAND_PLACEHOLDERS[effectiveDestination]}
      canEditCommand={canEditCommand}
      tooltipFooter={
        <>
          Type <span className="font-mono">{"{{"}</span> in the command to pick one. The paths
          describe the files this run is about to write, so a check can look at where a certificate
          is going before it goes there. Each variable is inserted already quoted, so do not wrap
          one in quotes yourself.
        </>
      }
      description="Runs before any certificate is written. A non-zero exit stops the sync, so nothing is delivered to a host that is not ready. Also runs once a day on its own, so you hear about a host that went bad before the next renewal does. Capped at 15 seconds."
      noPermissionDescription="You do not have permission to set a health check on this sync. Ask an administrator to change it."
      action={
        canEditCommand !== false && (
          <div className="mt-2">
            <Button
              size="xs"
              variant="outline"
              isDisabled={!command || !connectionId}
              isPending={testHealthCheck.isPending}
              onClick={handleTest}
            >
              Test check
            </Button>
          </div>
        )
      }
    />
  );
};
