import { format } from "date-fns";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  Separator
} from "@app/components/v3";
import { getPkiSyncFailureMessage } from "@app/helpers/pkiSyncs";
import { PkiSyncStatus, TPkiSync, usePkiSyncOption } from "@app/hooks/api/pkiSyncs";

import { HostCommandDetail } from "./HostCommandDetail";
import { SyncErrorDetail } from "./SyncErrorDetail";

type Props = {
  pkiSync: TPkiSync;
};

export const PkiSyncCommandsSection = ({ pkiSync }: Props) => {
  const { syncOption } = usePkiSyncOption(pkiSync.destination);
  const { healthCheckCommand, postSyncCommand } = pkiSync.syncOptions;

  const canRunHealthCheck = Boolean(syncOption?.canRunHealthCheckCommand);
  const canRunPostSync = Boolean(syncOption?.canRunPostSyncCommand);
  if (!canRunHealthCheck && !canRunPostSync) return null;

  const { lastHealthCheckRanAt, lastHealthCheckStatus, lastHealthCheckMessage } = pkiSync;

  const syncFailureMessage = getPkiSyncFailureMessage(pkiSync.syncStatus, pkiSync.lastSyncMessage);
  const checkErrorMessage =
    lastHealthCheckStatus === PkiSyncStatus.Failed &&
    lastHealthCheckMessage &&
    lastHealthCheckMessage !== syncFailureMessage
      ? lastHealthCheckMessage
      : null;

  return (
    <>
      <Separator className="mt-4" />
      <Accordion type="multiple" variant="ghost">
        <AccordionItem value="commands">
          <AccordionTrigger>Commands</AccordionTrigger>
          <AccordionContent>
            <DetailGroup>
              {canRunHealthCheck && (
                <>
                  <HostCommandDetail
                    label="Health Check"
                    command={healthCheckCommand}
                    showCommandLabel="Show check"
                    dialogDescription="Runs on the destination host before this sync delivers anything. A non-zero exit stops the sync."
                  />
                  {healthCheckCommand && (
                    <Detail>
                      <DetailLabel>Last Checked</DetailLabel>
                      <DetailValue>
                        {lastHealthCheckRanAt ? (
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                lastHealthCheckStatus === PkiSyncStatus.Failed
                                  ? "danger"
                                  : "success"
                              }
                            >
                              {lastHealthCheckStatus === PkiSyncStatus.Failed ? "Failed" : "Passed"}
                            </Badge>
                            <span>
                              {format(new Date(lastHealthCheckRanAt), "yyyy-MM-dd, h:mm a")}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted/50 italic">Never</span>
                        )}
                      </DetailValue>
                    </Detail>
                  )}
                  {checkErrorMessage && (
                    <SyncErrorDetail label="Last Check Error" message={checkErrorMessage} />
                  )}
                </>
              )}
              {canRunPostSync && (
                <HostCommandDetail
                  label="Post-Sync Command"
                  command={postSyncCommand}
                  showCommandLabel="Show command"
                  dialogDescription="Runs on the destination host after this sync delivers a certificate."
                />
              )}
            </DetailGroup>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
};
