import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";

import { ServerAdminsTable } from "./components";

export const AccessManagementPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "Access Control" })}</title>
      </Helmet>
      <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-8xl">
          <PageHeader
            scope="instance"
            title="Server Admin Access Control"
            description="Manage server admins within your Infisical instance."
          />
          <ServerAdminsTable />
        </div>
      </div>
    </div>
  );
};
