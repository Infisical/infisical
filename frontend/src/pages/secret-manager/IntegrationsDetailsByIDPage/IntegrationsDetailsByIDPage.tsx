import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faRefresh, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Checkbox,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  PageHeader,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { OrgPermissionActions, OrgPermissionSubjects, useWorkspace } from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import { useGetIntegration } from "@app/hooks/api";
import { useDeleteIntegration, useSyncIntegration } from "@app/hooks/api/integrations/queries";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { IntegrationAuditLogsSection } from "./components/IntegrationAuditLogsSection";
import { IntegrationConnectionSection } from "./components/IntegrationConnectionSection";
import { IntegrationDetailsSection } from "./components/IntegrationDetailsSection";
import { IntegrationSettingsSection } from "./components/IntegrationSettingsSection";
import { integrationSlugNameMapping } from "./IntegrationsDetailsByIDPage.utils";

export const IntegrationDetailsByIDPage = () => {
  const { t } = useTranslation();
  const integrationId = useParams({
    from: ROUTE_PATHS.SecretManager.IntegrationDetailsByIDPage.id,
    select: (el) => el.integrationId
  });

  const { data: integration } = useGetIntegration(integrationId, {
    refetchInterval: 4000
  });

  const [shouldDeleteSecrets, setShouldDeleteSecrets] = useToggle(false);

  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace.id;
  const { mutateAsync: syncIntegration } = useSyncIntegration();
  const { mutateAsync: deleteIntegration } = useDeleteIntegration();

  const navigate = useNavigate();

  const handleIntegrationDelete = async (shouldDeleteIntegrationSecrets: boolean) => {
    try {
      await deleteIntegration({
        id: integrationId,
        workspaceId: currentWorkspace.id,
        shouldDeleteIntegrationSecrets
      });

      createNotification({
        type: "success",
        text: "Deleted integration"
      });

      await navigate({
        to: `/${ProjectType.SecretManager}/${projectId}/integrations`
      });
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Failed to delete integration"
      });
    }
  };

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteConfirmation",
    "deleteSecretsConfirmation"
  ] as const);

  return (
    <>
      <Helmet>
        <title>Integration Details | Infisical</title>
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Manage your .env files in seconds" />
        <meta name="og:description" content={t("integrations.description") as string} />
      </Helmet>
      <div className="mx-auto flex max-w-7xl flex-col justify-between bg-bunker-800 text-white">
        {integration ? (
          <div className="mx-auto mb-6 w-full max-w-7xl">
            <PageHeader
              title={`${integrationSlugNameMapping[integration.integration]} Integration`}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild className="rounded-lg">
                  <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                    <Tooltip content="More options">
                      <Button variant="outline_bg">More</Button>
                    </Tooltip>
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="p-1">
                  <DropdownMenuItem
                    onClick={async () => {
                      await syncIntegration({
                        id: integration.id,
                        lastUsed: integration.lastUsed!,
                        workspaceId: projectId!
                      });
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon icon={faRefresh} />
                      Manually Sync
                    </div>
                  </DropdownMenuItem>
                  <OrgPermissionCan
                    I={OrgPermissionActions.Delete}
                    a={OrgPermissionSubjects.Member}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        className={twMerge(
                          isAllowed
                            ? "hover:!bg-red-500 hover:!text-white"
                            : "pointer-events-none cursor-not-allowed opacity-50"
                        )}
                        onClick={() => {
                          setShouldDeleteSecrets.off();
                          handlePopUpOpen("deleteConfirmation", integration);
                        }}
                        disabled={!isAllowed}
                      >
                        <div className="flex items-center gap-2">
                          <FontAwesomeIcon icon={faTrash} />
                          Delete Integration
                        </div>
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                </DropdownMenuContent>
              </DropdownMenu>
            </PageHeader>
            <div className="flex">
              <div className="mr-4 w-96">
                <IntegrationDetailsSection integration={integration} />
                <IntegrationConnectionSection integration={integration} />
              </div>
              <div className="flex-grow space-y-4">
                <IntegrationSettingsSection integration={integration} />
                <IntegrationAuditLogsSection integration={integration} />
              </div>
            </div>
          </div>
        ) : (
          <div>
            <EmptyState title="Error: Unable to fetch integration." className="py-12" />
          </div>
        )}
      </div>

      <DeleteActionModal
        isOpen={popUp.deleteConfirmation.isOpen}
        title={`Are you sure you want to remove ${integration?.integration || " "} integration for ${
          integration?.app || "this project"
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deleteConfirmation", isOpen)}
        deleteKey={
          (integration?.integration === "azure-app-configuration" &&
            integration?.app?.split("//")[1]?.split(".")[0]) ||
          integration?.app ||
          integration?.owner ||
          integration?.path ||
          integration?.integration ||
          ""
        }
        onDeleteApproved={async () => {
          if (shouldDeleteSecrets) {
            handlePopUpOpen("deleteSecretsConfirmation");
            return;
          }

          await handleIntegrationDelete(false);

          handlePopUpClose("deleteConfirmation");
        }}
      >
        {integration?.integration === "github" && (
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
        title={`Are you sure you also want to delete secrets on ${integration?.integration}?`}
        subTitle="By confirming, you acknowledge that all secrets managed by this integration will be removed from the destination. This action is irreversible."
        onChange={(isOpen) => handlePopUpToggle("deleteSecretsConfirmation", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={async () => {
          await handleIntegrationDelete(true);
          handlePopUpClose("deleteSecretsConfirmation");
          handlePopUpClose("deleteConfirmation");
        }}
      />
    </>
  );
};
