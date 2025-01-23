import { faFingerprint } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { useSubscription } from "@app/context";
import { EventType } from "@app/hooks/api/auditLogs/enums";
import { TSecretSync } from "@app/hooks/api/secretSyncs";
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

  const auditLogsRetentionDays = subscription?.auditLogsRetentionDays ?? 30;

  return (
    <div className="flex max-h-full w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="font-semibold text-mineshaft-100">Sync Logs</h3>
        {subscription.auditLogs && (
          <p className="text-xs text-bunker-300">
            Displaying audit logs from the last {auditLogsRetentionDays} days
          </p>
        )}
      </div>
      {subscription.auditLogs ? (
        <LogsSection
          refetchInterval={4000}
          remappedHeaders={{
            Metadata: "Sync Status"
          }}
          showFilters={false}
          presets={{
            eventMetadata: { syncId: secretSync.id },
            startDate: new Date(new Date().setDate(new Date().getDate() - auditLogsRetentionDays)),
            eventType: INTEGRATION_EVENTS
          }}
          filterClassName="bg-mineshaft-900 static"
        />
      ) : (
        <div className="flex h-full items-center justify-center rounded-lg bg-mineshaft-800 text-sm text-mineshaft-200">
          <div className="flex flex-col items-center gap-4 py-20">
            <FontAwesomeIcon size="2x" icon={faFingerprint} />
            <p>
              Please{" "}
              {subscription && subscription.slug !== null ? (
                <Link to="/organization/billing" target="_blank" rel="noopener noreferrer">
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
    </div>
  );
};
