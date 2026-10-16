import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { ExternalLink, TriangleAlert } from "lucide-react";

import {
  SELF_HOSTED_CONTACT_SALES_URL,
  SELF_HOSTED_LICENSE_COPY
} from "@app/components/license/self-hosted-license";
import { OrgPermissionCan } from "@app/components/permissions";
import { Alert, AlertDescription, AlertTitle, Button } from "@app/components/v3";
import { PageHeader } from "@app/components/v3/platform";
import { OrgPermissionBillingActions, OrgPermissionSubjects } from "@app/context";

// Standalone billing page for offline (air-gapped) licenses. It makes no API calls — the license
// server is unreachable, so every billing/subscription request would fail — and just explains that
// billing is managed out-of-band.
export const OfflineBillingPage = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-page">
      <Helmet>
        <title>{t("common.head-title", { title: t("billing.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex w-full justify-center bg-page text-foreground-inverse">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope="org"
            title={t("billing.title")}
            description={SELF_HOSTED_LICENSE_COPY.offline.pageDescription}
          />
          <OrgPermissionCan
            passThrough={false}
            I={OrgPermissionBillingActions.Read}
            a={OrgPermissionSubjects.Billing}
          >
            <Alert variant="info">
              <TriangleAlert />
              <AlertTitle>{SELF_HOSTED_LICENSE_COPY.offline.title}</AlertTitle>
              <AlertDescription>
                {SELF_HOSTED_LICENSE_COPY.offline.detail}
                <div className="mt-3">
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={SELF_HOSTED_CONTACT_SALES_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Contact Sales
                      <ExternalLink />
                    </a>
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </OrgPermissionCan>
        </div>
      </div>
    </div>
  );
};
