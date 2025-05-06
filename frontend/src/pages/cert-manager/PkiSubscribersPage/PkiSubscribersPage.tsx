import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";

import { PkiSubscriberSection } from "./components";

export const PkiSubscribersPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "PKI Subscribers" })}</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
          <div className="mx-auto mb-6 w-full max-w-7xl">
            <PageHeader title="Subscribers" description="Manage your PKI subscribers." />
            <PkiSubscriberSection />
          </div>
        </div>
      </div>
    </>
  );
};
