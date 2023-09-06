import { useTranslation } from "react-i18next";
import Head from "next/head";

import { OrgPermissionActions, OrgPermissionSubjects, TOrgPermission } from "@app/context";
import { withPermission } from "@app/hoc";
import { BillingSettingsPage } from "@app/views/Settings/BillingSettingsPage";

const SettingsBilling = withPermission<{}, TOrgPermission>(
  () => {
    const { t } = useTranslation();

    return (
      <div className="h-full bg-bunker-800">
        <Head>
          <title>{t("common.head-title", { title: t("billing.title") })}</title>
          <link rel="icon" href="/infisical.ico" />
          <meta property="og:image" content="/images/message.png" />
        </Head>
        <BillingSettingsPage />
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Billing }
);

Object.assign(SettingsBilling, { requireAuth: true });

export default SettingsBilling;
