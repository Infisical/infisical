import { useTranslation } from "react-i18next";
import Head from "next/head";

import { BillingSettingsPage } from "@app/views/Settings/BillingSettingsPage";

export default function SettingsBilling() {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Head>
        <title>{t("common.head-title", { title: t("billing.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <BillingSettingsPage />
    </div>
  );
}

SettingsBilling.requireAuth = true;