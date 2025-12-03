import { useCallback, useEffect } from "react";

import { createNotification } from "@app/components/notifications";
import { Checkbox, DeleteActionModal, Spinner } from "@app/components/v2";
import { useProject } from "@app/context";
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

import { IntegrationsTable } from "./IntegrationsTable";

export const NativeIntegrationsTab = () => {
  const { currentProject } = useProject();
  const { environments, id: workspaceId } = currentProject;

  const { data: cloudIntegrations, isPending: isCloudIntegrationsLoading } =
    useGetCloudIntegrations();

  const { data: integrationAuths, isFetching: isIntegrationAuthFetching } =
    useGetWorkspaceAuthorizations(
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

  const { reset: resetDeleteIntegrationAuths } = useDeleteIntegrationAuths();

  const isIntegrationsAuthorizedEmpty = !Object.keys(integrationAuths || {}).length;
  const isIntegrationsEmpty = !integrations?.length;
  // summary: this use effect is trigger when all integration auths are removed thus deactivate bot
  // details: so on successfully deleting an integration auth, immediately integration list is refeteched
  // After the refetch is completed check if its empty. Then set bot active and reset the submit hook for isSuccess to go back to false
  useEffect(() => {
    if (
      !isIntegrationFetching &&
      !isIntegrationAuthFetching &&
      isIntegrationsAuthorizedEmpty &&
      isIntegrationsEmpty
    ) {
      resetDeleteIntegrationAuths();
    }
  }, [
    isIntegrationFetching,
    isIntegrationAuthFetching,
    isIntegrationsAuthorizedEmpty,
    isIntegrationsEmpty
  ]);

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

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteConfirmation",
    "deleteSecretsConfirmation"
  ] as const);

  const [shouldDeleteSecrets, setShouldDeleteSecrets] = useToggle(false);

  if (isIntegrationLoading || isCloudIntegrationsLoading)
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2">
        <Spinner />
      </div>
    );

  return (
    <>
      {integrations?.length && (
        <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xl font-medium text-mineshaft-100">Native Integrations</p>
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
