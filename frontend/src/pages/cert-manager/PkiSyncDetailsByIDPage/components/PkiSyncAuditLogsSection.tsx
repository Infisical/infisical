import { Link } from "@tanstack/react-router";
import { FingerprintIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@app/components/v3";
import { useOrganization, useProject, useSubscription } from "@app/context";
import { EventType } from "@app/hooks/api/auditLogs/enums";
import { TPkiSync } from "@app/hooks/api/pkiSyncs";
import { LogsSection } from "@app/pages/organization/AuditLogsPage/components/LogsSection";

const PKI_SYNC_EVENTS = [
  EventType.PKI_SYNC_SYNC_CERTIFICATES,
  EventType.PKI_SYNC_IMPORT_CERTIFICATES,
  EventType.PKI_SYNC_REMOVE_CERTIFICATES,
  EventType.PKI_SYNC_HEALTH_CHECK
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
    <Card className="max-h-full min-w-0">
      <CardHeader>
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
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FingerprintIcon />
              </EmptyMedia>
              <EmptyTitle>Audit logs require an upgrade</EmptyTitle>
              <EmptyDescription>
                {subscription && subscription.slug !== null ? (
                  <Link
                    to="/organizations/$orgId/billing"
                    params={{ orgId: currentOrg.id }}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Upgrade your subscription
                  </Link>
                ) : (
                  <a
                    href="https://infisical.com/scheduledemo"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Upgrade your subscription
                  </a>
                )}{" "}
                to view sync logs.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
};
