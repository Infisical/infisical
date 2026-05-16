import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import { EmptyState } from "@app/components/v2";
import { PageLoader } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useGetGatewayV2ById } from "@app/hooks/api/gateways-v2";

import { GatewayConnectedResourcesSection } from "./components/GatewayConnectedResourcesSection/GatewayConnectedResourcesSection";
import { GatewayDeploySection } from "./components/GatewayDeploySection/GatewayDeploySection";
import { GatewayDetailsCard } from "./components/GatewayDetailsCard/GatewayDetailsCard";
import { GatewayPageHeader } from "./components/GatewayPageHeader/GatewayPageHeader";

const Page = () => {
  const params = useParams({ from: ROUTE_PATHS.Organization.GatewayDetailsByIDPage.id });
  const gatewayId = params.gatewayId as string;
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { data: gateway, isPending } = useGetGatewayV2ById(gatewayId);

  if (isPending) {
    return <PageLoader />;
  }

  if (!gateway) {
    return <EmptyState title="Gateway not found" />;
  }

  return (
    <div className="mx-auto flex max-w-8xl flex-col">
      <Link
        to="/organizations/$orgId/networking"
        params={{ orgId }}
        search={{ selectedTab: "gateways" }}
        className="mb-4 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition hover:text-mineshaft-400/80"
      >
        <ChevronLeftIcon size={16} />
        Gateways
      </Link>
      <GatewayPageHeader gateway={gateway} orgId={orgId} />
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="flex w-full flex-col gap-y-5 lg:max-w-[24rem]">
          <GatewayDetailsCard gateway={gateway} />
        </div>
        <div className="flex flex-1 flex-col gap-y-5">
          <GatewayDeploySection
            gatewayId={gatewayId}
            gatewayName={gateway.name}
            authMethod={gateway.authMethod}
            isFirstTimeSetup={!gateway.heartbeat}
          />
          <GatewayConnectedResourcesSection gatewayId={gatewayId} />
        </div>
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
