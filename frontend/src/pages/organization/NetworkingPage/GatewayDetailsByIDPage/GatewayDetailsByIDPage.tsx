import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";

import { OrgPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";

import { GatewaysSection } from "../components/GatewaysSection/GatewaysSection";

const Page = () => {
  const params = useParams({ from: ROUTE_PATHS.Organization.GatewayDetailsByIDPage.id });
  const gatewayId = params.gatewayId as string;
  const { isSubOrganization } = useOrganization();

  return (
    <div className="flex w-full justify-center bg-bunker-800 text-white">
      <div className="w-full max-w-8xl">
        <PageHeader
          scope={isSubOrganization ? "namespace" : "org"}
          title="Networking"
          description="Manage gateways and relays to securely access private network resources from Infisical"
        />
        <GatewaysSection initialGatewayId={gatewayId} />
      </div>
    </div>
  );
};

export const GatewayDetailsByIDPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <OrgPermissionCan
        passThrough={false}
        I={OrgGatewayPermissionActions.ListGateways}
        a={OrgPermissionSubjects.Gateway}
      >
        <Page />
      </OrgPermissionCan>
    </>
  );
};
