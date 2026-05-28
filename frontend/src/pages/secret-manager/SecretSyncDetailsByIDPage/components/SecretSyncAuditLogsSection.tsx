import { Link } from "@tanstack/react-router";
import { FingerprintIcon, RefreshCwIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v3";
import { useOrganization, useProject, useSubscription } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { EventType } from "@app/hooks/api/auditLogs/enums";
import { TSecretSync, useTriggerSecretSyncSyncSecrets } from "@app/hooks/api/secretSyncs";
import { getSecretSyncPermissionSubject } from "@app/lib/fn/permission";
import { LogsSection } from "@app/pages/organization/AuditLogsPage/components/LogsSection";

const INTEGRATION_EVENTS = [
  EventType.SECRET_SYNC_SYNC_SECRETS,
  EventType.SECRET_SYNC_REMOVE_SECRETS,
  EventType.SECRET_SYNC_IMPORT_SECRETS
];

type Props = {
  secretSync: TSecretSync;
};

export const SecretSyncAuditLogsSection = ({ secretSync }: Props) => {
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const triggerSyncSecrets = useTriggerSecretSyncSyncSecrets();
  const destinationName = SECRET_SYNC_MAP[secretSync.destination].name;
  const permissionSubject = getSecretSyncPermissionSubject(secretSync);

  const auditLogsRetentionDays = subscription?.auditLogsRetentionDays ?? 30;

  const handleTriggerSync = async () => {
    await triggerSyncSecrets.mutateAsync({
      syncId: secretSync.id,
      destination: secretSync.destination,
      projectId: secretSync.projectId
    });

    createNotification({
      text: `Successfully triggered ${destinationName} Sync`,
      type: "success"
    });
  };

  return (
    <Card className="max-h-full">
      <CardHeader className="border-b">
        <CardTitle>Sync Logs</CardTitle>
        {subscription.auditLogs && (
          <CardDescription>
            Displaying audit logs from the last {Math.min(auditLogsRetentionDays, 60)} days
          </CardDescription>
        )}
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionSecretSyncActions.SyncSecrets}
            a={permissionSubject}
          >
            {(isAllowed: boolean) => (
              <Button
                variant="outline"
                onClick={handleTriggerSync}
                isDisabled={!isAllowed}
                isPending={triggerSyncSecrets.isPending}
              >
                <RefreshCwIcon />
                Trigger Sync
              </Button>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent>
        {subscription.auditLogs ? (
          <LogsSection
            refetchInterval={15_000}
            showFilters={false}
            project={currentProject}
            presets={{
              eventMetadata: { syncId: secretSync.id },
              startDate: new Date(
                new Date().setDate(new Date().getDate() - Math.min(auditLogsRetentionDays, 60))
              ),
              eventType: INTEGRATION_EVENTS
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-lg bg-mineshaft-800 text-sm text-mineshaft-200">
            <div className="flex flex-col items-center gap-4 py-20">
              <FingerprintIcon className="size-8" />
              <p>
                Please{" "}
                {subscription && subscription.slug !== null ? (
                  <Link
                    to="/organizations/$orgId/billing"
                    params={{ orgId: currentOrg.id }}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <a
                      className="cursor-pointer underline transition-all hover:text-white"
                      target="_blank"
                    >
                      upgrade your subscription
                    </a>
                  </Link>
                ) : (
                  <a
                    href="https://infisical.com/scheduledemo"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <a
                      className="cursor-pointer underline transition-all hover:text-white"
                      target="_blank"
                    >
                      upgrade your subscription
                    </a>
                  </a>
                )}{" "}
                to view sync logs.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
