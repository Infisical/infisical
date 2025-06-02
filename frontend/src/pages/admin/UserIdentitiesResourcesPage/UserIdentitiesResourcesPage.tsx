import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";

import { UserIdentitiesTable } from "./components";

export const UserIdentitiesResourcesPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "Admin" })}</title>
      </Helmet>
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader
            title="User Identities"
            description="Manage all user identities within your Infisical instance."
          />
          <UserIdentitiesTable />
        </div>
      </div>
    </div>
  );
};
