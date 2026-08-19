import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { OrgPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  useServerConfig,
  useSubscription
} from "@app/context";

import { BillingV2Page } from "../BillingV2Page";
import { BillingTabGroup } from "./components";
import { OfflineBillingPage } from "./OfflineBillingPage";

export const BillingPage = () => {
  const { t } = useTranslation();
  const { config } = useServerConfig();
  const { subscription } = useSubscription();

  // Offline (air-gapped) licenses can't reach the license server, so neither billing surface can load;
  // short-circuit to the offline page (no API calls) before mounting either.
  if (subscription?.isOffline) {
    return <OfflineBillingPage />;
  }

  if (config.licenseServerV2Enabled) {
    return <BillingV2Page />;
  }

  return (
    <div className="h-full bg-background">
      <Helmet>
        <title>{t("common.head-title", { title: t("billing.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex h-full w-full justify-center bg-background text-foreground">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope="org"
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
