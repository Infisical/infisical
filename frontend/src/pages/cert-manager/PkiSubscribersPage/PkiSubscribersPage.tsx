import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";

import { PkiSubscriberSection } from "./components";

export const PkiSubscribersPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "PKI Subscribers" })}</title>
      </Helmet>
      <div className="h-full bg-page">
        <div className="mx-auto flex flex-col justify-between text-foreground-inverse">
          <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col gap-8">
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
