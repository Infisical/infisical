import { Helmet } from "react-helmet";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageHeader } from "@app/components/v2";
import {
  LookingForOrgPageLink,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";

import { AuditLogStreamsTab } from "./components/AuditLogStreamTab";
import { LogsSection } from "./components";

enum AuditLogsPageTabs {
  AuditLogs = "audit-logs",
  Streams = "streams"
}

const AuditLogsTab = () => <LogsSection pageView />;

export const AuditLogsPage = () => {
  const navigate = useNavigate();
  const { isSubOrganization, currentOrg } = useOrganization();
  const { selectedTab } = useSearch({
    from: ROUTE_PATHS.Organization.AuditLogsPage.id
  });

  const tabs = [
    { key: AuditLogsPageTabs.AuditLogs, label: "Audit Logs", component: AuditLogsTab },
    { key: AuditLogsPageTabs.Streams, label: "External Log Streams", component: AuditLogStreamsTab }
  ];

  const activeTab = tabs.some((tab) => tab.key === selectedTab)
    ? selectedTab
    : AuditLogsPageTabs.AuditLogs;

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: "/organizations/$orgId/audit-logs",
      params: { orgId: currentOrg.id },
      search: { selectedTab: tab }
    });
  };

  return (
    <div className="h-full bg-background">
      <Helmet>
        <title>Infisical | Audit Logs</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex w-full justify-center bg-background pb-6 text-foreground">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            title={`${isSubOrganization ? "Sub-Organization" : "Organization"} Audit Logs`}
            description="Audit logs for security and compliance teams to monitor information access."
          >
            <LookingForOrgPageLink page="auditLogs" target="root" />
          </PageHeader>
          <Tabs value={activeTab} onValueChange={updateSelectedTab}>
            <TabsList variant={isSubOrganization ? "sub-org" : "org"}>
              {tabs.map(({ key, label }) => (
                <TabsTrigger value={key} key={`tab-${key}`}>
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.map(({ key, component: Component }) => (
              <TabsContent value={key} key={`tab-panel-${key}`}>
                <Component />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  );
};
