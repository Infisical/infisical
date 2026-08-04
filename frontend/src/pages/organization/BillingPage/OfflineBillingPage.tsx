import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { TriangleAlert } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";
import { OrgPermissionBillingActions, OrgPermissionSubjects } from "@app/context";

// Standalone billing page for offline (air-gapped) licenses. It makes no API calls — the license
// server is unreachable, so every billing/subscription request would fail — and just explains that
// billing is managed out-of-band.
export const OfflineBillingPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: t("billing.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope="org"
            title={t("billing.title")}
            description="Your plan is provisioned through an offline license."
          />
          <OrgPermissionCan
            passThrough={false}
            I={OrgPermissionBillingActions.Read}
            a={OrgPermissionSubjects.Billing}
          >
            <Alert variant="info">
              <TriangleAlert />
              <AlertTitle>Offline license</AlertTitle>
              <AlertDescription>
                This instance runs on an offline license, so subscription and billing management
                isn&apos;t available here. Contact your Infisical account manager to make changes to
                your plan.
              </AlertDescription>
            </Alert>
          </OrgPermissionCan>
        </div>
      </div>
    </div>
  );
};
