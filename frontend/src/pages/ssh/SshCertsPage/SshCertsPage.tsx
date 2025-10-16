import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";

import { SshCertificatesSection } from "./components";

export const SshCertsPage = () => {
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
              scope="project"
              title="SSH Certificates"
              description="View and audit all issued SSH certificates, including validity and associated access metadata."
            />
            <SshCertificatesSection />
          </div>
        </div>
      </div>
    </>
  );
};
