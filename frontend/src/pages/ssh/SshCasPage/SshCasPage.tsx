import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";

import { SshCaSection } from "./components";

export const SshCasPage = () => {
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
              scope="project"
              title="SSH Certificate Authorities"
              description="Manage the SSH certificate authorities used to sign user and host certificates, including custom and default CAs."
            />
            <SshCaSection />
          </div>
        </div>
      </div>
    </>
  );
};
