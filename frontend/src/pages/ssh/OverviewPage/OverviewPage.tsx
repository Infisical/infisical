import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

import { SshCaSection, SshCertificatesSection } from "./components";

enum TabSections {
  SshCa = "ssh-certificate-authorities",
  SshCertificates = "ssh-certificates"
}

export const OverviewPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "Certificates" })}</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
          <div className="mx-auto mb-6 w-full max-w-7xl">
            <PageHeader
              title="Overview"
              description="Infisical SSH lets you issue SSH credentials to clients to provide short-lived, secure SSH access to infrastructure."
            />
            <Tabs defaultValue={TabSections.SshCertificates}>
              <TabList>
                <Tab value={TabSections.SshCertificates}>SSH Certificates</Tab>
                <Tab value={TabSections.SshCa}>Certificate Authorities</Tab>
              </TabList>
              <TabPanel value={TabSections.SshCertificates}>
                <motion.div
                  key="panel-ssh-certificate-s"
                  transition={{ duration: 0.15 }}
                  initial={{ opacity: 0, translateX: 30 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  exit={{ opacity: 0, translateX: 30 }}
                >
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Read}
                    a={ProjectPermissionSub.SshCertificates}
                    renderGuardBanner
                    passThrough={false}
                  >
                    <SshCertificatesSection />
                  </ProjectPermissionCan>
                </motion.div>
              </TabPanel>
              <TabPanel value={TabSections.SshCa}>
                <motion.div
                  key="panel-ssh-certificate-authorities"
                  transition={{ duration: 0.15 }}
                  initial={{ opacity: 0, translateX: 30 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  exit={{ opacity: 0, translateX: 30 }}
                >
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Read}
                    a={ProjectPermissionSub.SshCertificateAuthorities}
                    renderGuardBanner
                    passThrough={false}
                  >
                    <SshCaSection />
                  </ProjectPermissionCan>
                </motion.div>
              </TabPanel>
            </Tabs>
          </div>
        </div>
      </div>
    </>
  );
};
