import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, ServerIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  PageLoader
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import {
  OrgKmipServerPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useGetKmipServerById } from "@app/hooks/api/kmipServers";

import { KmipServerClientsSection } from "./components/KmipServerClientsSection/KmipServerClientsSection";
import { KmipServerDeploySection } from "./components/KmipServerDeploySection/KmipServerDeploySection";
import { KmipServerDetailsCard } from "./components/KmipServerDetailsCard/KmipServerDetailsCard";
import { KmipServerPageHeader } from "./components/KmipServerPageHeader/KmipServerPageHeader";

const Page = () => {
  const params = useParams({ from: ROUTE_PATHS.Organization.KmipServerDetailsByIDPage.id });
  const kmipServerId = params.kmipServerId as string;
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";
  const { data: kmipServer, isPending } = useGetKmipServerById(kmipServerId);

  if (isPending) {
    return <PageLoader />;
  }

  if (!kmipServer) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ServerIcon />
          </EmptyMedia>
          <EmptyTitle>KMIP server not found</EmptyTitle>
          <EmptyDescription>
            It may have been deleted. Return to the list to pick another KMIP server.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild variant="outline" size="sm">
            <Link to="/organizations/$orgId/projects/kms/kmip-servers" params={{ orgId }}>
              Back to KMIP Servers
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="mx-auto flex max-w-8xl flex-col">
      <Link
        to="/organizations/$orgId/projects/kms/kmip-servers"
        params={{ orgId }}
        className="mb-4 flex w-fit items-center gap-x-1 text-sm text-muted transition hover:text-label"
      >
        <ChevronLeftIcon size={16} />
        KMIP Servers
      </Link>
      <KmipServerPageHeader kmipServer={kmipServer} orgId={orgId} />
      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="w-full min-w-0 shrink-0 lg:w-96">
          <KmipServerDetailsCard kmipServer={kmipServer} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-y-8">
          <KmipServerDeploySection
            kmipServerId={kmipServerId}
            kmipServerName={kmipServer.name}
            authMethod={kmipServer.authMethod}
          />
          <KmipServerClientsSection />
        </div>
      </div>
    </div>
  );
};

export const KmipServerDetailsByIDPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <OrgPermissionCan
        passThrough={false}
        I={OrgKmipServerPermissionActions.ListKmipServers}
        a={OrgPermissionSubjects.KmipServer}
      >
        <Page />
      </OrgPermissionCan>
    </>
  );
};
