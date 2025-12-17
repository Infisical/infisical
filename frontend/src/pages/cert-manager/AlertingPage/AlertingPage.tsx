import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useListWorkspacePkiAlerts } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { PkiAlertsV2Page } from "@app/views/PkiAlertsV2Page";

import { PkiAlertsSection, PkiCollectionSection } from "./components";

export const AlertingPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const [selectedTab, setSelectedTab] = useState("rule-based");

  const { data: v1AlertsData } = useListWorkspacePkiAlerts({
    projectId: currentProject?.id || ""
  });

  const hasV1Alerts = v1AlertsData?.alerts && v1AlertsData.alerts.length > 0;

  return (
    <div className="mx-auto flex h-full flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: "Alerting" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.CertificateManager}
          title={
            <span className="inline-flex items-center gap-x-2">
              Alerting
              <span className="mt-0.5">
                <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/pki/alerting" />
              </span>
            </span>
          }
          description="Configure alerts for expiring certificates and CAs to maintain security and compliance."
        />
        <ProjectPermissionCan
          renderGuardBanner
          I={ProjectPermissionActions.Read}
          a={ProjectPermissionSub.PkiAlerts}
        >
          {!hasV1Alerts ? (
            <div>
              <PkiAlertsV2Page hideContainer />
            </div>
          ) : (
            <Tabs orientation="vertical" value={selectedTab} onValueChange={setSelectedTab}>
              <TabList>
                <Tab variant="project" value="rule-based">
                  Certificate Alerts
                </Tab>
                <Tab variant="project" value="legacy">
                  Collection Alerts (Legacy)
                </Tab>
              </TabList>

              <TabPanel value="rule-based">
                <PkiAlertsV2Page />
              </TabPanel>

              <TabPanel value="legacy">
                <div className="space-y-6">
                  <PkiAlertsSection />
                  <PkiCollectionSection />
                </div>
              </TabPanel>
            </Tabs>
          )}
        </ProjectPermissionCan>
      </div>
    </div>
  );
};
