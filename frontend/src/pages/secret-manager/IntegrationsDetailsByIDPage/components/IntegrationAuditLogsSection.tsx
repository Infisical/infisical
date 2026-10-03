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
import { TIntegrationWithEnv } from "@app/hooks/api/integrations/types";
import { LogsSection } from "@app/pages/organization/AuditLogsPage/components/LogsSection";

// Add more events if needed
const INTEGRATION_EVENTS = [EventType.INTEGRATION_SYNCED];

type Props = {
  integration: TIntegrationWithEnv;
};

export const IntegrationAuditLogsSection = ({ integration }: Props) => {
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const auditLogsRetentionDays = subscription?.auditLogsRetentionDays ?? 30;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Integration Logs</CardTitle>
        {subscription?.auditLogs && (
          <CardDescription>
            Displaying audit logs from the last {Math.min(auditLogsRetentionDays, 60)} days
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {subscription?.auditLogs ? (
          <LogsSection
            refetchInterval={15_000}
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
                to view integration logs.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
};
