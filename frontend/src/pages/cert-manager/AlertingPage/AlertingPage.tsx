import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DocumentationLinkBadge,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useListWorkspacePkiAlerts } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { PkiAlertsV2Page } from "@app/views/PkiAlertsV2Page";

import { PkiDocsUrls } from "../pki-docs-urls";
import { PkiAlertsSection, PkiCollectionSection } from "./components";

export const AlertingPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const [selectedTab, setSelectedTab] = useState("rule-based");
  const [tabsOrientation, setTabsOrientation] = useState<"horizontal" | "vertical">(() =>
    window.matchMedia("(min-width: 80rem)").matches ? "vertical" : "horizontal"
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 80rem)");
    const updateOrientation = () =>
      setTabsOrientation(mediaQuery.matches ? "vertical" : "horizontal");

    mediaQuery.addEventListener("change", updateOrientation);

    return () => mediaQuery.removeEventListener("change", updateOrientation);
  }, []);

  const { data: v1AlertsData } = useListWorkspacePkiAlerts({
    projectId: currentProject?.id || ""
  });

  const hasV1Alerts = v1AlertsData?.alerts && v1AlertsData.alerts.length > 0;

  return (
    <div className="mx-auto flex h-full flex-col justify-between bg-page text-foreground-inverse">
      <Helmet>
        <title>{t("common.head-title", { title: "Alerting" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col gap-8">
        <PageHeader
          scope={ProjectType.CertificateManager}
          title={
            <span className="inline-flex items-center gap-x-2">
              Alerting
              <span className="mt-0.5">
                <DocumentationLinkBadge href={PkiDocsUrls.applications.alerting.overview} />
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
            <Tabs orientation={tabsOrientation} value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList variant="project" aria-label="Alerting sections">
                <TabsTrigger value="rule-based">Certificate Alerts</TabsTrigger>
                <TabsTrigger value="legacy">Collection Alerts (Legacy)</TabsTrigger>
              </TabsList>

              <TabsContent value="rule-based">
                <PkiAlertsV2Page />
              </TabsContent>

              <TabsContent value="legacy">
                <div className="space-y-6">
                  <PkiAlertsSection />
                  <PkiCollectionSection />
                </div>
              </TabsContent>
            </Tabs>
          )}
        </ProjectPermissionCan>
      </div>
    </div>
  );
};
