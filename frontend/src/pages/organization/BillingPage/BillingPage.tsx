import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { OrgPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { OrgPermissionBillingActions, OrgPermissionSubjects } from "@app/context";

import { BillingTabGroup } from "./components";

export const BillingPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: t("billing.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl px-6">
          <PageHeader
            title={t("billing.title")}
            description="View your billing plan, next billing cycle."
          />

          <OrgPermissionCan
            passThrough={false}
            I={OrgPermissionBillingActions.Read}
            a={OrgPermissionSubjects.Billing}
          >
            <BillingTabGroup />
          </OrgPermissionCan>
        </div>
      </div>
    </div>
  );
};
