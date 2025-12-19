import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import { useOrganization } from "@app/context";

import { OrgTabGroup } from "./components";

export const SettingsPage = () => {
  const { t } = useTranslation();
  const { isSubOrganization, currentOrg } = useOrganization();

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            description={`Configure ${isSubOrganization ? "sub-" : ""}organization-wide settings`}
            title={isSubOrganization ? "Sub-Organization Settings" : "Organization Settings"}
          >
            {isSubOrganization && (
              <Link
                to="/organizations/$orgId/settings"
                params={{
                  orgId: currentOrg.rootOrgId ?? ""
                }}
                className="flex items-center gap-x-1.5 text-xs whitespace-nowrap text-neutral hover:underline"
              >
                <InfoIcon size={12} /> Looking for root organization settings?
              </Link>
            )}
          </PageHeader>
          <OrgTabGroup />
        </div>
      </div>
    </>
  );
};
