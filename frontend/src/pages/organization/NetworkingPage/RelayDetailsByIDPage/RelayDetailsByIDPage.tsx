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
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import { useGetRelayById } from "@app/hooks/api/relays";

import { RelayDeploySection } from "./components/RelayDeploySection/RelayDeploySection";
import { RelayDetailsCard } from "./components/RelayDetailsCard/RelayDetailsCard";
import { RelayPageHeader } from "./components/RelayPageHeader/RelayPageHeader";

const Page = () => {
  const params = useParams({ from: ROUTE_PATHS.Organization.RelayDetailsByIDPage.id });
  const relayId = params.relayId as string;
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { data: relay, isPending } = useGetRelayById(relayId);

  if (isPending) {
    return <PageLoader />;
  }

  if (!relay) {
    return <EmptyState title="Relay not found" />;
  }

  return (
    <div className="mx-auto flex max-w-8xl flex-col">
      <Link
        to="/organizations/$orgId/networking"
        params={{ orgId }}
        search={{ selectedTab: "relays" }}
        className="mb-4 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition hover:text-mineshaft-400/80"
      >
        <ChevronLeftIcon size={16} />
        Relays
      </Link>
      <RelayPageHeader relay={relay} orgId={orgId} />
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="flex w-full flex-col gap-y-5 lg:max-w-[24rem]">
          <RelayDetailsCard relay={relay} />
        </div>
        <div className="flex flex-1 flex-col gap-y-5">
          <RelayDeploySection
            relayId={relayId}
            relayName={relay.name}
            authMethod={relay.authMethod}
            isFirstTimeSetup={!relay.heartbeat}
          />
        </div>
      </div>
    </div>
  );
};

export const RelayDetailsByIDPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <OrgPermissionCan
        passThrough={false}
        I={OrgRelayPermissionActions.ListRelays}
        a={OrgPermissionSubjects.Relay}
      >
        <Page />
      </OrgPermissionCan>
    </>
  );
};
