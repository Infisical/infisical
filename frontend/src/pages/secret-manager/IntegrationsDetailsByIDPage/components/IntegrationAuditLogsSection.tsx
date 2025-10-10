import { Link } from "@tanstack/react-router";

import { EmptyState } from "@app/components/v2";
import { useProject, useSubscription } from "@app/context";
import { EventType } from "@app/hooks/api/auditLogs/enums";
import { TIntegrationWithEnv } from "@app/hooks/api/integrations/types";
import { LogsSection } from "@app/pages/organization/AuditLogsPage/components/LogsSection";

// Add more events if needed
const INTEGRATION_EVENTS = [EventType.INTEGRATION_SYNCED];

type Props = {
  integration: TIntegrationWithEnv;
};

export const IntegrationAuditLogsSection = ({ integration }: Props) => {
  const { subscription } = useSubscription();
  const { currentProject } = useProject();

  const auditLogsRetentionDays = subscription?.auditLogsRetentionDays ?? 30;

  // eslint-disable-next-line no-nested-ternary
  return subscription?.auditLogs ? (
    <div className="min-w-204 border-mineshaft-600 bg-mineshaft-900 h-full w-full rounded-lg border p-4">
      <div className="border-mineshaft-400 mb-4 flex items-center justify-between border-b pb-4">
        <p className="text-lg font-medium text-gray-200">Integration Logs</p>
        <p className="text-xs text-gray-400">
          Displaying audit logs from the last {Math.min(auditLogsRetentionDays, 60)} days
        </p>
      </div>
      <LogsSection
        refetchInterval={4000}
        showFilters={false}
        project={currentProject}
        presets={{
          eventMetadata: { integrationId: integration.id },
          startDate: new Date(
            new Date().setDate(new Date().getDate() - Math.min(auditLogsRetentionDays, 60))
          ),
          eventType: INTEGRATION_EVENTS
        }}
      />
    </div>
  ) : (
    <div className="min-w-204 border-mineshaft-600 bg-mineshaft-900 h-full w-full rounded-lg border p-4 opacity-60">
      <div className="border-mineshaft-400 mb-4 flex items-center justify-between border-b pb-4">
        <p className="text-lg font-medium text-gray-200">Integration Logs</p>
      </div>
      <EmptyState
        className="rounded-lg"
        title={
          <div>
            <p>
              Please{" "}
              {subscription && subscription.slug !== null ? (
                <Link to="/organization/billing" target="_blank" rel="noopener noreferrer">
                  <a
                    className="text-primary-500 hover:text-primary-600 cursor-pointer font-medium transition-all"
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
                    className="text-primary-500 hover:text-primary-600 cursor-pointer font-medium transition-all"
                    target="_blank"
                  >
                    upgrade your subscription
                  </a>
                </a>
              )}{" "}
              to view integration logs
            </p>
          </div>
        }
      />
    </div>
  );
};
