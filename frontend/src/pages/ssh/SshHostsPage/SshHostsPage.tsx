import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";
import { ProjectType } from "@app/hooks/api/projects/types";

import { SshHostGroupsSection, SshHostsSection } from "./components";

export const SshHostsPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "SSH" })}</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
          <div className="mx-auto mb-6 w-full max-w-8xl">
            <PageHeader
              scope={ProjectType.SSH}
              title="Hosts"
              description="Manage your SSH hosts, configure access policies, and define login behavior for secure connections."
            />
            <SshHostGroupsSection />
            <SshHostsSection />
          </div>
        </div>
      </div>
    </>
  );
};
