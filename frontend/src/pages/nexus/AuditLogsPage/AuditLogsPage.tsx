import { Helmet } from "react-helmet";

import {
  Button,
  PageHeader,
  Table,
  TableContainer,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { Timezone } from "@app/helpers/datetime";
import { ActorType, EventType, UserAgentType } from "@app/hooks/api/auditLogs/enums";
import { AuditLog } from "@app/hooks/api/auditLogs/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { LogsTableRow } from "@app/pages/organization/AuditLogsPage/components/LogsTableRow";

const mockAuditLogs = [
  {
    id: "nexus-log-1",
    actor: { type: ActorType.USER, metadata: { userId: "u1", email: "ashwin@infisical.com" } },
    event: {
      type: EventType.NEXUS_POLICY_ACTIVATED,
      metadata: { policyName: "PQC Migration Policy" }
    },
    organization: "org-1",
    workspace: "ws-1",
    ipAddress: "192.168.1.10",
    userAgent: "Mozilla/5.0",
    userAgentType: UserAgentType.WEB,
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString()
  },
  {
    id: "nexus-log-2",
    actor: { type: ActorType.PLATFORM, metadata: {} },
    event: {
      type: EventType.NEXUS_DISCOVERY_SCAN_COMPLETED,
      metadata: { jobName: "Full Infrastructure Scan", assetsFound: 1247, duration: "4m 32s" }
    },
    organization: "org-1",
    workspace: "ws-1",
    ipAddress: "10.0.0.1",
    userAgent: "InfisicalPlatform/1.0",
    userAgentType: UserAgentType.OTHER,
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString()
  },
  {
    id: "nexus-log-3",
    actor: { type: ActorType.USER, metadata: { userId: "u2", email: "daniel@infisical.com" } },
    event: {
      type: EventType.NEXUS_VIOLATION_ACCEPTED_RISK,
      metadata: { violationId: "viol-301", policyName: "TLS 1.2 Deprecation" }
    },
    organization: "org-1",
    workspace: "ws-1",
    ipAddress: "192.168.1.22",
    userAgent: "Mozilla/5.0",
    userAgentType: UserAgentType.WEB,
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString()
  },
  {
    id: "nexus-log-4",
    actor: { type: ActorType.USER, metadata: { userId: "u3", email: "arsh@infisical.com" } },
    event: {
      type: EventType.NEXUS_POLICY_CREATED,
      metadata: { policyName: "RSA Key Length Minimum", policyType: "key-strength" }
    },
    organization: "org-1",
    workspace: "ws-1",
    ipAddress: "192.168.1.15",
    userAgent: "Mozilla/5.0",
    userAgentType: UserAgentType.WEB,
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString()
  },
  {
    id: "nexus-log-5",
    actor: { type: ActorType.USER, metadata: { userId: "u1", email: "ashwin@infisical.com" } },
    event: {
      type: EventType.NEXUS_INTEGRATION_ADDED,
      metadata: { integrationName: "AWS Certificate Manager", project: "Production" }
    },
    organization: "org-1",
    workspace: "ws-1",
    ipAddress: "192.168.1.10",
    userAgent: "Mozilla/5.0",
    userAgentType: UserAgentType.WEB,
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString()
  },
  {
    id: "nexus-log-6",
    actor: { type: ActorType.USER, metadata: { userId: "u1", email: "ashwin@infisical.com" } },
    event: {
      type: EventType.NEXUS_DISCOVERY_SCAN_STARTED,
      metadata: { jobName: "Certificate Inventory Scan" }
    },
    organization: "org-1",
    workspace: "ws-1",
    ipAddress: "192.168.1.10",
    userAgent: "Mozilla/5.0",
    userAgentType: UserAgentType.WEB,
    createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString()
  },
  {
    id: "nexus-log-7",
    actor: { type: ActorType.PLATFORM, metadata: {} },
    event: {
      type: EventType.NEXUS_VIOLATION_TICKET_CREATED,
      metadata: { violationId: "viol-298", ticketId: "JIRA-4521", systemName: "Jira" }
    },
    organization: "org-1",
    workspace: "ws-1",
    ipAddress: "10.0.0.1",
    userAgent: "InfisicalPlatform/1.0",
    userAgentType: UserAgentType.OTHER,
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString()
  },
  {
    id: "nexus-log-8",
    actor: { type: ActorType.USER, metadata: { userId: "u4", email: "carlos@infisical.com" } },
    event: {
      type: EventType.NEXUS_POLICY_DEACTIVATED,
      metadata: { policyName: "Legacy SHA-1 Detection" }
    },
    organization: "org-1",
    workspace: "ws-1",
    ipAddress: "192.168.1.30",
    userAgent: "Mozilla/5.0",
    userAgentType: UserAgentType.WEB,
    createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString()
  },
  {
    id: "nexus-log-9",
    actor: { type: ActorType.USER, metadata: { userId: "u1", email: "ashwin@infisical.com" } },
    event: {
      type: EventType.NEXUS_SETTINGS_UPDATED,
      metadata: { settingKey: "scan_frequency", value: "daily" }
    },
    organization: "org-1",
    workspace: "ws-1",
    ipAddress: "192.168.1.10",
    userAgent: "Mozilla/5.0",
    userAgentType: UserAgentType.WEB,
    createdAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 240).toISOString()
  },
  {
    id: "nexus-log-10",
    actor: { type: ActorType.PLATFORM, metadata: {} },
    event: {
      type: EventType.NEXUS_DISCOVERY_SCAN_COMPLETED,
      metadata: { jobName: "Weekly Compliance Audit", assetsFound: 892, duration: "2m 15s" }
    },
    organization: "org-1",
    workspace: "ws-1",
    ipAddress: "10.0.0.1",
    userAgent: "InfisicalPlatform/1.0",
    userAgentType: UserAgentType.OTHER,
    createdAt: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 300).toISOString()
  }
] as AuditLog[];

export const AuditLogsPage = () => {
  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>Nexus Audit Logs</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope={ProjectType.Nexus}
            title="Audit Logs"
            description="Audit logs for security and compliance teams to monitor information access."
          />
          <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <div className="mb-4 flex items-center gap-x-2">
              <p className="text-xl font-medium text-mineshaft-100">Audit History</p>
            </div>
            <TableContainer>
              <Table>
                <THead>
                  <Tr>
                    <Th className="w-24">#</Th>
                    <Th className="w-64">Timestamp</Th>
                    <Th>Event</Th>
                  </Tr>
                </THead>
                <TBody>
                  {mockAuditLogs.map((auditLog, index) => (
                    <LogsTableRow
                      key={auditLog.id}
                      auditLog={auditLog}
                      rowNumber={index + 1}
                      timezone={Timezone.Local}
                    />
                  ))}
                </TBody>
              </Table>
            </TableContainer>
            <Button
              className="mt-4 px-4 py-3 text-sm"
              isFullWidth
              variant="outline_bg"
              isDisabled
            >
              End of logs
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
