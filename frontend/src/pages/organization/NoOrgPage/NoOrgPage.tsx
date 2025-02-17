import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import { usePopUp } from "@app/hooks";

export const NoOrgPage = () => {
  const { t } = useTranslation();

  const { popUp, handlePopUpToggle } = usePopUp(["createOrg"] as const);

  useEffect(() => {
    handlePopUpToggle("createOrg", true);
  }, []);

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="min-h-screen bg-bunker-800">
        <CreateOrgModal
          isOpen={popUp.createOrg.isOpen}
          onClose={() => handlePopUpToggle("createOrg", false)}
        />
      </div>
    </>
  );
};
