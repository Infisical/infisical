import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";

import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import { usePopUp } from "@app/hooks";

const NoneOrganization = () => {
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
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <CreateOrgModal
          isOpen={popUp.createOrg.isOpen}
          onClose={() => handlePopUpToggle("createOrg", false)}
        />
      </div>
    </>
  );
};

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/none/"
)({
  component: NoneOrganization
});
