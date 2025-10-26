import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";
import { ProjectType } from "@app/hooks/api/projects/types";

import { PkiSubscriberSection } from "./components";

export const PkiSubscribersPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "PKI Subscribers" })}</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="mx-auto flex flex-col justify-between text-white">
          <div className="mx-auto mb-6 w-full max-w-8xl">
            <PageHeader
              scope={ProjectType.CertificateManager}
              title="Subscribers"
              description="Manage subscribers that request and receive certificates, including user devices, servers, and services."
            />
            <PkiSubscriberSection />
          </div>
        </div>
      </div>
    </>
  );
};
