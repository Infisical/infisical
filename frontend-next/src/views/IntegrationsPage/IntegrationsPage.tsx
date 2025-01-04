import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { withProjectPermission } from "@app/hoc";
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
import { redirectForProviderAuth } from "./IntegrationPage.utils";

type Props = {
  frameworkIntegrations: Array<{ name: string; slug: string; image: string; docsLink: string }>;
  infrastructureIntegrations: Array<{
    name: string;
    slug: string;
    image: string;
    docsLink: string;
  }>;
};

enum IntegrationView {
  List = "list",
  New = "new"
}

export const IntegrationsPage = withProjectPermission(
  ({ frameworkIntegrations, infrastructureIntegrations }: Props) => {
    const { currentWorkspace } = useWorkspace();
    const workspaceId = currentWorkspace?.id || "";
    const environments = currentWorkspace?.environments || [];
    const [view, setView] = useState<IntegrationView>(IntegrationView.New);

    const { data: cloudIntegrations, isLoading: isCloudIntegrationsLoading } =
      useGetCloudIntegrations();

    const {
      data: integrationAuths,
      isLoading: isIntegrationAuthLoading,
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
      isLoading: isIntegrationLoading,
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
        redirectForProviderAuth(selectedCloudIntegration);
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
              <FrameworkIntegrationSection frameworks={frameworkIntegrations} />
              <InfrastructureIntegrationSection integrations={infrastructureIntegrations} />
            </motion.div>
          )}
        </div>
      </div>
    );
  },
  {
    action: ProjectPermissionActions.Read,
    subject: ProjectPermissionSub.Integrations
  }
);
