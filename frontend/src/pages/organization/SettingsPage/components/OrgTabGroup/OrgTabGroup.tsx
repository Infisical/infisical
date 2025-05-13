import { useState } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { Link, useSearch } from "@tanstack/react-router";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { AuditLogStreamsTab } from "../AuditLogStreamTab";
import { ImportTab } from "../ImportTab";
import { KmipTab } from "../KmipTab/OrgKmipTab";
import { OrgEncryptionTab } from "../OrgEncryptionTab";
import { OrgGeneralTab } from "../OrgGeneralTab";
import { OrgSecurityTab } from "../OrgSecurityTab";
import { OrgWorkflowIntegrationTab } from "../OrgWorkflowIntegrationTab/OrgWorkflowIntegrationTab";

export const OrgTabGroup = () => {
  const search = useSearch({
    from: ROUTE_PATHS.Organization.SettingsPage.id
  });
  const tabs = [
    { name: "General", key: "tab-org-general", component: OrgGeneralTab },
    { name: "Security", key: "tab-org-security", component: OrgSecurityTab },
    { name: "Encryption", key: "tab-org-encryption", component: OrgEncryptionTab },
    {
      name: "Workflow Integrations",
      key: "workflow-integrations",
      component: OrgWorkflowIntegrationTab
    },
    { name: "Audit Log Streams", key: "tag-audit-log-streams", component: AuditLogStreamsTab },
    { name: "Import", key: "tab-import", component: ImportTab },
    {
      name: "Project Templates",
      key: "project-templates",
      // scott: temporary, remove once users have adjusted
      // eslint-disable-next-line react/no-unstable-nested-components
      component: () => (
        <div>
          <NoticeBannerV2
            className="mx-auto"
            titleClassName="text-base"
            title="Project Templates Relocated"
          >
            <p className="mt-1 text-mineshaft-300">
              Project templates have been relocated and are now product specific:
            </p>
            <ul className="mb-1 flex gap-x-4 text-mineshaft-200">
              {[
                {
                  type: ProjectType.SecretManager,
                  label: "Secret Management",
                  icon: "sliding-carousel"
                },
                {
                  type: ProjectType.CertificateManager,
                  label: "Certificate Management",
                  icon: "note"
                },
                {
                  type: ProjectType.KMS,
                  label: "KMS",
                  icon: "unlock"
                },
                {
                  type: ProjectType.SSH,
                  label: "SSH",
                  icon: "verified"
                }
              ].map(({ label, type, icon }, index) => (
                <li key={`project-template-${type}`}>
                  <Link
                    to={`/organization/${type}/settings`}
                    className="mt-1 flex items-center gap-x-2 hover:text-mineshaft-100"
                  >
                    {index !== 0 && <span className="text-mineshaft-300">•</span>}
                    <DotLottieReact
                      src={`/lotties/${icon}.json`}
                      loop
                      className="mt-0.5 h-5 w-5"
                    />{" "}
                    <span className="underline underline-offset-2">{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </NoticeBannerV2>
        </div>
      )
    },
    { name: "KMIP", key: "kmip", component: KmipTab }
  ];

  const [selectedTab, setSelectedTab] = useState(search.selectedTab || tabs[0].key);

  return (
    <Tabs value={selectedTab} onValueChange={setSelectedTab}>
      <TabList>
        {tabs.map((tab) => (
          <Tab value={tab.key} key={tab.key}>
            {tab.name}
          </Tab>
        ))}
      </TabList>
      {tabs.map(({ key, component: Component }) => (
        <TabPanel value={key} key={`tab-panel-${key}`}>
          <Component />
        </TabPanel>
      ))}
    </Tabs>
  );
};
