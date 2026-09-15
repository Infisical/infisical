import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v3";

import { EncryptionKeyRotationSection, EncryptionPageForm } from "./components";

export const EncryptionPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full text-foreground">
      <Helmet>
        <title>{t("common.head-title", { title: "Admin" })}</title>
      </Helmet>
      <div className="mx-auto flex flex-col justify-between">
        <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col gap-8">
          <PageHeader
            scope="instance"
            title="Encryption"
            description="Manage encryption settings for your Infisical instance."
          />
          <div className="flex flex-col gap-6">
            <EncryptionPageForm />
            <EncryptionKeyRotationSection />
          </div>
        </div>
      </div>
    </div>
  );
};
