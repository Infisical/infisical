import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import { usePopUp } from "@app/hooks";
import { createFileRoute } from "@tanstack/react-router";

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

export const Route = createFileRoute("/_authenticate/_org_details/_org-layout/organization/none/")({
  component: NoneOrganization
});
