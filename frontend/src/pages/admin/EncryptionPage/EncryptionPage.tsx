import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";

import { EncryptionPageForm } from "./components";

export const EncryptionPage = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-bunker-800 h-full">
      <Helmet>
        <title>{t("common.head-title", { title: "Admin" })}</title>
      </Helmet>
      <div className="bg-bunker-800 container mx-auto flex flex-col justify-between text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader
            title="Encryption"
            description="Manage encryption settings for your Infisical instance."
          />
          <EncryptionPageForm />
        </div>
      </div>
    </div>
  );
};
