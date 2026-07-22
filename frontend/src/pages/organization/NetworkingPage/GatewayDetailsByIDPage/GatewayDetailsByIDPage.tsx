import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  PageLoader,
  Separator
} from "@app/components/v3";
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
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon" />
          <EmptyTitle>Gateway not found</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
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
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="w-full min-w-0 lg:col-start-2 lg:row-start-1">
          <GatewayDetailsCard gateway={gateway} />
        </div>
        <div className="flex min-w-0 flex-col gap-y-8 lg:col-start-1 lg:row-start-1">
          <GatewayDeploySection
            gatewayId={gatewayId}
            gatewayName={gateway.name}
            authMethod={gateway.authMethod}
          />
          <Separator />
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
