import { Button } from "@infisical/cipher/ui/button";

import { HEALTH_CHECK_COMMAND_VARIABLE_DESCRIPTIONS } from "@app/helpers/pkiSyncs";
import { PkiSync, PkiSyncStatus } from "@app/hooks/api/pkiSyncs/enums";
import type { TPkiSyncFilters } from "@app/hooks/api/pkiSyncs/types";

import { toast } from "../../../../access/toast";
import { useV4Adapter } from "../../../../data/adapters";
import { useConnectionId, usePkiSyncForm, useWatchedValue } from "../fields";
import { notifyUnhandledHostCommandError } from "./host-command-errors";
import { HostCommandField } from "./host-command-field";

const COMMAND_PLACEHOLDERS: Partial<Record<PkiSync, string>> = {
  [PkiSync.LinuxServer]: "test -w {{certificateDirectory}} && systemctl is-active nginx",
  [PkiSync.WindowsServer]:
    'if (-not (Test-Path {{certificateDirectory}})) { throw "destination directory is missing" }'
};

export function PkiSyncHealthCheckCommandFields({
  destination,
  applicationId,
  syncId,
  canEditCommand
}: {
  destination?: PkiSync;
  applicationId?: string | null;
  syncId?: string;
  canEditCommand?: boolean;
}) {
  const { getValues } = usePkiSyncForm();
  const testHealthCheck = useV4Adapter("pkiSyncs").useTestHealthCheck();
  const watchedDestination = useWatchedValue<PkiSync>("destination");
  const command = useWatchedValue<string | undefined>("syncOptions.healthCheckCommand");
  const connectionId = useConnectionId();
  const effectiveDestination = destination ?? watchedDestination;
  let testBlock: string | undefined;
  if (!command) testBlock = "Enter a health check command first";
  else if (!connectionId) testBlock = "Select a connection first";

  const handleTest = async () => {
    if (!connectionId) return;
    try {
      const result = await testHealthCheck.mutateAsync({
        destination: effectiveDestination,
        connectionId,
        applicationId: applicationId ?? undefined,
        syncId,
        filters: syncId ? undefined : ((getValues("filters") ?? null) as TPkiSyncFilters | null),
        destinationConfig: (getValues("destinationConfig") ?? {}) as Record<string, unknown>,
        syncOptions: {
          ...((getValues("syncOptions") ?? {}) as Record<string, unknown>),
          healthCheckCommand: command
        }
      });
      const passed = result.status === PkiSyncStatus.Succeeded;
      toast({
        tone: passed ? "ok" : "bad",
        title: passed ? "Health check passed" : "Health check failed",
        description:
          result.output || result.failureDetail || result.message || "The host reported no output."
      });
    } catch (error) {
      notifyUnhandledHostCommandError(error, "Could not run the health check");
    }
  };

  return (
    <HostCommandField
      name="syncOptions.healthCheckCommand"
      label="Health check"
      descriptions={HEALTH_CHECK_COMMAND_VARIABLE_DESCRIPTIONS}
      placeholder={COMMAND_PLACEHOLDERS[effectiveDestination]}
      canEditCommand={canEditCommand}
      tooltipFooter="Type {{ in the command to pick one. The paths describe the files this run is about to write, so a check can look at where a certificate is going before it goes there. Each variable is inserted already quoted, so do not wrap one in quotes yourself."
      description="Checks the host before Infisical writes any certificate. If the command fails, or does not finish within 15 seconds, the sync stops and nothing is delivered. Infisical also runs this check once a day, so a broken host surfaces before a renewal reaches it."
      noPermissionDescription="You do not have permission to set a health check on this sync. Ask an administrator to change it."
      action={
        canEditCommand !== false && (
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabledReason={testBlock}
              loading={testHealthCheck.isPending}
              onClick={handleTest}
            >
              Test check
            </Button>
          </div>
        )
      }
    />
  );
}
