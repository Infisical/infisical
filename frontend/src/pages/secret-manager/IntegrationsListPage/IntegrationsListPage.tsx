import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { ContentLoader } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import {
  useDeleteIntegration,
  useDeleteIntegrationAuths,
  useGetCloudIntegrations,
  useGetWorkspaceAuthorizations,
  useGetWorkspaceIntegrations
} from "@app/hooks/api";
import { IntegrationAuth } from "@app/hooks/api/types";

import { CloudIntegrationSection } from "./components/CloudIntegrationSection";
import { FrameworkIntegrationSection } from "./components/FrameworkIntegrationSection";
import { InfrastructureIntegrationSection } from "./components/InfrastructureIntegrationSection/InfrastructureIntegrationSection";
import { IntegrationsSection } from "./components/IntegrationsSection";
import { redirectForProviderAuth } from "./IntegrationsListPage.utils";

enum IntegrationView {
  List = "list",
  New = "new"
}

const Page = () => {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const { environments, id: workspaceId } = currentWorkspace;
  const [view, setView] = useState<IntegrationView>(IntegrationView.New);

  const { data: cloudIntegrations, isPending: isCloudIntegrationsLoading } =
    useGetCloudIntegrations();

  const {
    data: integrationAuths,
    isPending: isIntegrationAuthLoading,
    isFetching: isIntegrationAuthFetching
  } = useGetWorkspaceAuthorizations(
    workspaceId,
    useCallback((data: IntegrationAuth[]) => {
      const groupBy: Record<string, IntegrationAuth> = {};
      data.forEach((el) => {
        groupBy[el.integration] = el;
      });
      return groupBy;
    }, [])
  );

  // mutation
  const {
    data: integrations,
    isPending: isIntegrationLoading,
    isFetching: isIntegrationFetching,
    isFetched: isIntegrationsFetched
  } = useGetWorkspaceIntegrations(workspaceId);

  const { mutateAsync: deleteIntegration } = useDeleteIntegration();
  const {
    mutateAsync: deleteIntegrationAuths,
    isSuccess: isDeleteIntegrationAuthSuccess,
    reset: resetDeleteIntegrationAuths
  } = useDeleteIntegrationAuths();

  const isIntegrationsAuthorizedEmpty = !Object.keys(integrationAuths || {}).length;
  const isIntegrationsEmpty = !integrations?.length;
  // summary: this use effect is trigger when all integration auths are removed thus deactivate bot
  // details: so on successfully deleting an integration auth, immediately integration list is refeteched
  // After the refetch is completed check if its empty. Then set bot active and reset the submit hook for isSuccess to go back to false
  useEffect(() => {
    if (
      isDeleteIntegrationAuthSuccess &&
      !isIntegrationFetching &&
      !isIntegrationAuthFetching &&
      isIntegrationsAuthorizedEmpty &&
      isIntegrationsEmpty
    ) {
      resetDeleteIntegrationAuths();
    }
  }, [
    isIntegrationFetching,
    isDeleteIntegrationAuthSuccess,
    isIntegrationAuthFetching,
    isIntegrationsAuthorizedEmpty,
    isIntegrationsEmpty
  ]);

  useEffect(() => {
    setView(integrations?.length ? IntegrationView.List : IntegrationView.New);
  }, [isIntegrationsFetched]);

  const handleProviderIntegration = async (provider: string) => {
    const selectedCloudIntegration = cloudIntegrations?.find(({ slug }) => provider === slug);
    if (!selectedCloudIntegration) return;

    try {
      redirectForProviderAuth(currentWorkspace.id, navigate, selectedCloudIntegration);
    } catch (error) {
      console.error(error);
    }
  };

  // function to strat integration for a provider
  // confirmation to user passing the bot key for provider to get secret access
  const handleProviderIntegrationStart = (provider: string) => {
    handleProviderIntegration(provider);
  };

  const handleIntegrationDelete = async (
    integrationId: string,
    shouldDeleteIntegrationSecrets: boolean,
    cb: () => void
  ) => {
    try {
      await deleteIntegration({ id: integrationId, workspaceId, shouldDeleteIntegrationSecrets });
      if (cb) cb();
      createNotification({
        type: "success",
        text: "Deleted integration"
      });
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Failed to delete integration"
      });
    }
  };

  const handleIntegrationAuthRevoke = async (provider: string, cb?: () => void) => {
    const integrationAuthForProvider = integrationAuths?.[provider];
    if (!integrationAuthForProvider) return;

    try {
      await deleteIntegrationAuths({
        integration: provider,
        workspaceId
      });
      if (cb) cb();
      createNotification({
        type: "success",
        text: "Revoked provider authentication"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        type: "error",
        text: "Failed to revoke provider authentication"
      });
    }
  };

  if (isIntegrationLoading || isCloudIntegrationsLoading)
    return (
      <div className="flex flex-col items-center gap-2">
        <ContentLoader text={["Loading integrations..."]} />
      </div>
    );

  return (
    <div className="container relative mx-auto max-w-7xl pb-12 text-white">
      <div className="relative">
        {view === IntegrationView.List ? (
          <motion.div
            key="view-integrations"
            transition={{ duration: 0.3 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
            className="w-full"
          >
            <IntegrationsSection
              cloudIntegrations={cloudIntegrations}
              onAddIntegration={() => setView(IntegrationView.New)}
              isLoading={isIntegrationLoading}
              integrations={integrations}
              environments={environments}
              onIntegrationDelete={handleIntegrationDelete}
              workspaceId={workspaceId}
            />
          </motion.div>
        ) : (
          <motion.div
            key="add-integration"
            transition={{ duration: 0.3 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
            className="w-full"
          >
            <CloudIntegrationSection
              onViewActiveIntegrations={
                integrations?.length ? () => setView(IntegrationView.List) : undefined
              }
              isLoading={isCloudIntegrationsLoading || isIntegrationAuthLoading}
              cloudIntegrations={cloudIntegrations}
              integrationAuths={integrationAuths}
              onIntegrationStart={handleProviderIntegrationStart}
              onIntegrationRevoke={handleIntegrationAuthRevoke}
            />
            <FrameworkIntegrationSection />
            <InfrastructureIntegrationSection />
          </motion.div>
        )}
      </div>
    </div>
  );
};

export const IntegrationsListPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("integrations.title") })}</title>
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Manage your .env files in seconds" />
        <meta name="og:description" content={t("integrations.description") as string} />
      </Helmet>
      <ProjectPermissionCan
        renderGuardBanner
        passThrough={false}
        I={ProjectPermissionActions.Read}
        a={ProjectPermissionSub.Integrations}
      >
        <Page />
      </ProjectPermissionCan>
    </>
  );
};
