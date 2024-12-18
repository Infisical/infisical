import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";

import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { BillingTabGroup } from "./-components";

const BillngPage = withPermission(
  () => {
    const { t } = useTranslation();
    return (
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl px-6">
          <div className="my-6">
            <p className="text-3xl font-semibold text-gray-200">{t("billing.title")}</p>
            <div />
          </div>
          <BillingTabGroup />
        </div>
      </div>
    );
  },
  {
    action: OrgPermissionActions.Read,
    subject: OrgPermissionSubjects.Billing
  }
);

const BillingRoute = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: t("billing.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <BillngPage />
    </div>
  );
};

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/$organizationId/billing/"
)({
  component: BillingRoute
});
