import { faFingerprint } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

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
    <div className="flex max-h-full w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="text-lg font-medium text-mineshaft-100">Sync Logs</h3>
        {subscription.auditLogs && (
          <p className="text-xs text-bunker-300">
            Displaying audit logs from the last {Math.min(auditLogsRetentionDays, 60)} days
          </p>
        )}
      </div>
      {subscription.auditLogs ? (
        <LogsSection
          refetchInterval={4000}
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
            <FontAwesomeIcon size="2x" icon={faFingerprint} />
            <p>
              Please{" "}
              {subscription && subscription.slug !== null ? (
                <Link
                  to="/organizations/$orgId/billing"
                  params={{ orgId: currentOrg.id }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="cursor-pointer underline transition-all hover:text-white">
                    upgrade your subscription
                  </span>
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
    </div>
  );
};
