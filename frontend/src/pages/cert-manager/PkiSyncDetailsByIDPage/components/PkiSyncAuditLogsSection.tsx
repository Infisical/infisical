import { Link } from "@tanstack/react-router";
import { FingerprintIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
import { useOrganization, useProject, useSubscription } from "@app/context";
import { EventType } from "@app/hooks/api/auditLogs/enums";
import { TPkiSync } from "@app/hooks/api/pkiSyncs";
import { LogsSection } from "@app/pages/organization/AuditLogsPage/components/LogsSection";

const PKI_SYNC_EVENTS = [
  EventType.PKI_SYNC_SYNC_CERTIFICATES,
  EventType.PKI_SYNC_IMPORT_CERTIFICATES,
  EventType.PKI_SYNC_REMOVE_CERTIFICATES
];

type Props = {
  pkiSync: TPkiSync;
};

export const PkiSyncAuditLogsSection = ({ pkiSync }: Props) => {
  const { subscription } = useSubscription();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const auditLogsRetentionDays = subscription?.auditLogsRetentionDays ?? 30;

  return (
    <Card className="max-h-full">
      <CardHeader className="border-b">
        <CardTitle>Sync Logs</CardTitle>
        {subscription.auditLogs && (
          <CardDescription>
            Displaying audit logs from the last {Math.min(auditLogsRetentionDays, 60)} days
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {subscription.auditLogs ? (
          <LogsSection
            refetchInterval={15_000}
            showFilters={false}
            project={currentProject}
            presets={{
              eventMetadata: { syncId: pkiSync.id },
              startDate: new Date(
                new Date().setDate(new Date().getDate() - Math.min(auditLogsRetentionDays, 60))
              ),
              eventType: PKI_SYNC_EVENTS
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
                    className="cursor-pointer underline transition-all hover:text-white"
                  >
                    upgrade your subscription
                  </Link>
                ) : (
                  <a
                    href="https://infisical.com/scheduledemo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cursor-pointer underline transition-all hover:text-white"
                  >
                    upgrade your subscription
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
