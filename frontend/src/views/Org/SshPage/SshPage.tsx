import { motion } from "framer-motion";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { SshCaSection, SshCertificatesSection } from "./components";

enum TabSections {
  SshCa = "ssh-certificate-authorities",
  SshCertificates = "ssh-certificates"
}

export const SshPage = withPermission(
  () => {
    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl py-6 px-6">
          <p className="mr-4 mb-4 text-3xl font-semibold text-white">SSH</p>
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
                <SshCertificatesSection />
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
                <SshCaSection />
              </motion.div>
            </TabPanel>
          </Tabs>
        </div>
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.SshCertificateAuthorities }
);
