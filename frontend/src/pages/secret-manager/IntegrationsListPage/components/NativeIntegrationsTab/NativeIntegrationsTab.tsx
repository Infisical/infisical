import { useCallback, useEffect, useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { Button, Checkbox, DeleteActionModal, Spinner } from "@app/components/v2";
import { useOrganization, useProject } from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import {
  useDeleteIntegration,
  useDeleteIntegrationAuths,
  useGetCloudIntegrations,
  useGetWorkspaceAuthorizations,
  useGetWorkspaceIntegrations
} from "@app/hooks/api";
import { IntegrationAuth } from "@app/hooks/api/integrationAuth/types";
import { TIntegration } from "@app/hooks/api/integrations/types";

import { redirectForProviderAuth } from "../../IntegrationsListPage.utils";
import { CloudIntegrationSection } from "../CloudIntegrationSection";
import { IntegrationsTable } from "./IntegrationsTable";

enum IntegrationView {
  List = "list",
  New = "new"
}

export const NativeIntegrationsTab = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { environments, id: workspaceId } = currentProject;
  const navigate = useNavigate();

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
    isFetching: isIntegrationFetching
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

  const handleProviderIntegration = async (provider: string) => {
    const selectedCloudIntegration = cloudIntegrations?.find(({ slug }) => provider === slug);
    if (!selectedCloudIntegration) return;

    try {
      redirectForProviderAuth(currentOrg.id, currentProject.id, navigate, selectedCloudIntegration);
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
    await deleteIntegration({ id: integrationId, workspaceId, shouldDeleteIntegrationSecrets });
    if (cb) cb();
    createNotification({
      type: "success",
      text: "Deleted integration"
    });
  };

  const handleIntegrationAuthRevoke = async (provider: string, cb?: () => void) => {
    const integrationAuthForProvider = integrationAuths?.[provider];
    if (!integrationAuthForProvider) return;

    await deleteIntegrationAuths({
      integration: provider,
      workspaceId
    });
    if (cb) cb();
    createNotification({
      type: "success",
      text: "Revoked provider authentication"
    });
  };

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteConfirmation",
    "deleteSecretsConfirmation"
  ] as const);

  const [view, setView] = useState<IntegrationView>(IntegrationView.List);

  const [shouldDeleteSecrets, setShouldDeleteSecrets] = useToggle(false);

  if (isIntegrationLoading || isCloudIntegrationsLoading)
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2">
        <Spinner />
      </div>
    );

  return (
    <>
      {view === IntegrationView.List ? (
        <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xl font-medium text-mineshaft-100">Native Integrations</p>
            <Button
              colorSchema="secondary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => setView(IntegrationView.New)}
            >
              Add Integration
            </Button>
          </div>
          <IntegrationsTable
            cloudIntegrations={cloudIntegrations}
            integrations={integrations}
            isLoading={isIntegrationLoading}
            workspaceId={workspaceId}
            environments={environments}
            onDeleteIntegration={(integration) => {
              setShouldDeleteSecrets.off();
              handlePopUpOpen("deleteConfirmation", integration);
            }}
          />
        </div>
      ) : (
        <CloudIntegrationSection
          onIntegrationStart={handleProviderIntegrationStart}
          onIntegrationRevoke={handleIntegrationAuthRevoke}
          integrationAuths={integrationAuths}
          cloudIntegrations={cloudIntegrations}
          isLoading={isIntegrationAuthLoading || isCloudIntegrationsLoading}
          onViewActiveIntegrations={() => setView(IntegrationView.List)}
        />
      )}
      <DeleteActionModal
        isOpen={popUp.deleteConfirmation.isOpen}
        title={`Are you sure you want to remove ${
          (popUp?.deleteConfirmation.data as TIntegration)?.integration || " "
        } integration for ${
          (popUp?.deleteConfirmation.data as TIntegration)?.app || "this project"
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteConfirmation", isOpen)}
        deleteKey={
          ((popUp?.deleteConfirmation?.data as TIntegration)?.integration ===
            "azure-app-configuration" &&
            (popUp?.deleteConfirmation?.data as TIntegration)?.app
              ?.split("//")[1]
              ?.split(".")[0]) ||
          (popUp?.deleteConfirmation?.data as TIntegration)?.app ||
          (popUp?.deleteConfirmation?.data as TIntegration)?.owner ||
          (popUp?.deleteConfirmation?.data as TIntegration)?.path ||
          (popUp?.deleteConfirmation?.data as TIntegration)?.integration ||
          ""
        }
        onDeleteApproved={async () => {
          if (shouldDeleteSecrets) {
            handlePopUpOpen("deleteSecretsConfirmation");
            return;
          }

          await handleIntegrationDelete(
            (popUp?.deleteConfirmation.data as TIntegration).id,
            false,
            () => handlePopUpClose("deleteConfirmation")
          );
        }}
      >
        {(popUp?.deleteConfirmation?.data as TIntegration)?.integration === "github" && (
          <div className="mt-4">
            <Checkbox
              id="delete-integration-secrets"
              checkIndicatorBg="text-white"
              onCheckedChange={() => setShouldDeleteSecrets.toggle()}
            >
              Delete previously synced secrets from the destination
            </Checkbox>
          </div>
        )}
      </DeleteActionModal>
      <DeleteActionModal
        isOpen={popUp.deleteSecretsConfirmation.isOpen}
        title={`Are you sure you also want to delete secrets on ${
          (popUp?.deleteConfirmation.data as TIntegration)?.integration
        }?`}
        subTitle="By confirming, you acknowledge that all secrets managed by this integration will be removed from the destination. This action is irreversible."
        onChange={(isOpen) => handlePopUpToggle("deleteSecretsConfirmation", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={async () => {
          await handleIntegrationDelete(
            (popUp?.deleteConfirmation.data as TIntegration).id,
            true,
            () => {
              handlePopUpClose("deleteSecretsConfirmation");
              handlePopUpClose("deleteConfirmation");
            }
          );
        }}
      />
    </>
  );
};
