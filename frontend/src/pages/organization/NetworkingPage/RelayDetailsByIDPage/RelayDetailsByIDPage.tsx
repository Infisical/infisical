import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";

import { OrgPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import {
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";

import { RelaysSection } from "../components/RelaysSection/RelaysSection";

const Page = () => {
  const params = useParams({ from: ROUTE_PATHS.Organization.RelayDetailsByIDPage.id });
  const relayId = params.relayId as string;
  const { isSubOrganization } = useOrganization();

  return (
    <div className="flex w-full justify-center bg-bunker-800 text-white">
      <div className="w-full max-w-8xl">
        <PageHeader
          scope={isSubOrganization ? "namespace" : "org"}
          title="Networking"
          description="Manage gateways and relays to securely access private network resources from Infisical"
        />
        <RelaysSection initialRelayId={relayId} />
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
