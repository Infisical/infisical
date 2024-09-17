import Link from "next/link";

import { EmptyState } from "@app/components/v2";
import { useSubscription } from "@app/context";
import { EventType } from "@app/hooks/api/auditLogs/enums";
import { TIntegrationWithEnv } from "@app/hooks/api/integrations/types";
import { LogsSection } from "@app/views/Project/AuditLogsPage/components";

// Add more events if needed
const INTEGRATION_EVENTS = [EventType.INTEGRATION_SYNCED];

type Props = {
  integration: TIntegrationWithEnv;
  orgId: string;
};

export const IntegrationAuditLogsSection = ({ integration, orgId }: Props) => {
  const { subscription, isLoading } = useSubscription();

  const auditLogsRetentionDays = subscription?.auditLogsRetentionDays ?? 30;

  // eslint-disable-next-line no-nested-ternary
  return subscription?.auditLogs ? (
    <div className="h-full w-full min-w-[51rem] rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <p className="text-lg font-semibold text-gray-200">Integration Logs</p>
        <p className="text-xs text-gray-400">
          Displaying audit logs from the last {auditLogsRetentionDays} days
        </p>
      </div>
      <LogsSection
        refetchInterval={4000}
        remappedHeaders={{
          Metadata: "Sync Status"
        }}
        showFilters={false}
        presets={{
          eventMetadata: { integrationId: integration.id },
          startDate: new Date(new Date().setDate(new Date().getDate() - auditLogsRetentionDays)),
          eventType: INTEGRATION_EVENTS
        }}
        filterClassName="bg-mineshaft-900 static"
      />
    </div>
  ) : !isLoading ? (
    <div className="h-full w-full min-w-[51rem] rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4 opacity-60">
      <div className="mb-4 flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <p className="text-lg font-semibold text-gray-200">Integration Logs</p>
      </div>
      <EmptyState
        className="rounded-lg"
        title={
          <div>
            <p>
              Please{" "}
              <Link
                href={
                  subscription && subscription.slug !== null
                    ? `/org${orgId}/billing`
                    : "https://infisical.com/scheduledemo"
                }
                passHref
              >
                <a
                  className="cursor-pointer font-medium text-primary-500 transition-all hover:text-primary-600"
                  target="_blank"
                >
                  upgrade your subscription
                </a>
              </Link>{" "}
              to view integration logs
            </p>
          </div>
        }
      />
    </div>
  ) : null;
};
