import { faFingerprint } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { useOrganization, useProject, useSubscription } from "@app/context";
import { EventType } from "@app/hooks/api/auditLogs/enums";
import { TSecretSync } from "@app/hooks/api/secretSyncs";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
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

  const auditLogsRetentionDays =
    subscription.get(SubscriptionProductCategory.Platform, "auditLogsRetentionDays") ?? 30;

  return (
    <div className="flex max-h-full w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="font-medium text-mineshaft-100">Sync Logs</h3>
        {subscription.get(SubscriptionProductCategory.Platform, "auditLogs") && (
          <p className="text-xs text-bunker-300">
            Displaying audit logs from the last {Math.min(auditLogsRetentionDays, 60)} days
          </p>
        )}
      </div>
      {subscription.get(SubscriptionProductCategory.Platform, "auditLogs") ? (
        <LogsSection
          refetchInterval={4000}
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
            <FontAwesomeIcon size="2x" icon={faFingerprint} />
            <p>
              Please{" "}
              {subscription &&
              subscription.productPlans?.[SubscriptionProductCategory.SecretManager] ? (
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
    </div>
  );
};
