import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";

export const NoOrgPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="min-h-screen bg-bunker-800">
        <CreateOrgModal isOpen />
      </div>
    </>
  );
};
