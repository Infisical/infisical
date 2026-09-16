import { useState } from "react";
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

  const { data: v1AlertsData } = useListWorkspacePkiAlerts({
    projectId: currentProject?.id || ""
  });

  const hasV1Alerts = v1AlertsData?.alerts && v1AlertsData.alerts.length > 0;

  return (
    <div className="mx-auto flex h-full flex-col justify-between text-white">
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
            <Tabs
              orientation="vertical"
              value={selectedTab}
              onValueChange={setSelectedTab}
              className="max-xl:flex-col xl:gap-x-12"
            >
              <TabsList
                variant="project"
                aria-label="Alerting sections"
                className="max-xl:gap-0 max-xl:border-b max-xl:border-border max-xl:data-[orientation=vertical]:h-11 max-xl:data-[orientation=vertical]:flex-row xl:data-[orientation=vertical]:gap-y-6 xl:data-[style=underline]:w-fit"
              >
                <TabsTrigger
                  value="rule-based"
                  className="max-xl:data-[orientation=vertical]:h-11 max-xl:data-[orientation=vertical]:w-auto max-xl:data-[orientation=vertical]:justify-center max-xl:data-[orientation=vertical]:px-3 max-xl:data-[orientation=vertical]:py-0.5 max-xl:data-[orientation=vertical]:after:inset-x-0 max-xl:data-[orientation=vertical]:after:inset-y-auto max-xl:data-[orientation=vertical]:after:bottom-0 max-xl:data-[orientation=vertical]:after:h-0.5 max-xl:data-[orientation=vertical]:after:w-auto xl:data-[orientation=vertical]:h-5 xl:data-[orientation=vertical]:py-0"
                >
                  Certificate Alerts
                </TabsTrigger>
                <TabsTrigger
                  value="legacy"
                  className="max-xl:data-[orientation=vertical]:h-11 max-xl:data-[orientation=vertical]:w-auto max-xl:data-[orientation=vertical]:justify-center max-xl:data-[orientation=vertical]:px-3 max-xl:data-[orientation=vertical]:py-0.5 max-xl:data-[orientation=vertical]:after:inset-x-0 max-xl:data-[orientation=vertical]:after:inset-y-auto max-xl:data-[orientation=vertical]:after:bottom-0 max-xl:data-[orientation=vertical]:after:h-0.5 max-xl:data-[orientation=vertical]:after:w-auto xl:data-[orientation=vertical]:h-5 xl:data-[orientation=vertical]:py-0"
                >
                  Collection Alerts (Legacy)
                </TabsTrigger>
              </TabsList>

              <TabsContent value="rule-based" className="mt-0 py-5 xl:overflow-x-hidden xl:py-0">
                <PkiAlertsV2Page />
              </TabsContent>

              <TabsContent value="legacy" className="mt-0 py-5 xl:overflow-x-hidden xl:py-0">
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
