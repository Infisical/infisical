import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";
import { ProjectType } from "@app/hooks/api/projects/types";

import { SshCertificatesSection } from "./components";

export const SshCertsPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "Certificates" })}</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
          <div className="mx-auto mb-6 w-full max-w-8xl">
            <PageHeader
              scope={ProjectType.SSH}
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
