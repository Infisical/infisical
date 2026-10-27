import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import { MoreVerticalIcon, RefreshCwIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PageTitle } from "@app/components/PageTitle";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyTitle,
  Field,
  FieldLabel
} from "@app/components/v3";
import { ConfirmationAlertDialog, PageHeader } from "@app/components/v3/platform";
import { ROUTE_PATHS } from "@app/const/routes";
import { OrgPermissionActions, OrgPermissionSubjects, useProject } from "@app/context";
import { usePopUp, useToggle } from "@app/hooks";
import { useGetIntegration } from "@app/hooks/api";
import { useDeleteIntegration, useSyncIntegration } from "@app/hooks/api/integrations/queries";
import { ProjectType } from "@app/hooks/api/projects/types";

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
    refetchInterval: 30_000
  });

  const [shouldDeleteSecrets, setShouldDeleteSecrets] = useToggle(false);

  const { currentProject } = useProject();
  const projectId = currentProject.id;
  const { mutateAsync: syncIntegration } = useSyncIntegration();
  const { mutateAsync: deleteIntegration } = useDeleteIntegration();

  const navigate = useNavigate();

  const handleIntegrationDelete = async (shouldDeleteIntegrationSecrets: boolean) => {
    await deleteIntegration({
      id: integrationId,
      workspaceId: currentProject.id,
      shouldDeleteIntegrationSecrets
    });

    createNotification({
      type: "success",
      text: "Deleted integration"
    });

    await navigate({
      to: `/${ProjectType.SecretManager}/${projectId}/integrations`
    });
  };

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteConfirmation",
    "deleteSecretsConfirmation"
  ] as const);

  return (
    <>
      <PageTitle title="Integration Details" />
      <meta property="og:image" content="/images/message.png" />
      <meta property="og:title" content="Manage your .env files in seconds" />
      <meta name="og:description" content={t("integrations.description") as string} />
      <div className="mx-auto flex max-w-8xl flex-col justify-between bg-page text-foreground-inverse">
        {integration ? (
          <div className="mx-auto mb-6 w-full max-w-8xl">
            <PageHeader
              scope={ProjectType.SecretManager}
              title={`${integrationSlugNameMapping[integration.integration]} Integration`}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <MoreVerticalIcon />
                    More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={async () => {
                      await syncIntegration({
                        id: integration.id,
                        lastUsed: integration.lastUsed!,
                        workspaceId: projectId!
                      });
                    }}
                  >
                    <RefreshCwIcon />
                    Manually Sync
                  </DropdownMenuItem>
                  <OrgPermissionCan
                    I={OrgPermissionActions.Delete}
                    a={OrgPermissionSubjects.Member}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        variant="danger"
                        onClick={() => {
                          setShouldDeleteSecrets.off();
                          handlePopUpOpen("deleteConfirmation", integration);
                        }}
                        isDisabled={!isAllowed}
                      >
                        <TrashIcon />
                        Delete Integration
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
              <div className="grow space-y-4">
                <IntegrationSettingsSection integration={integration} />
                <IntegrationAuditLogsSection integration={integration} />
              </div>
            </div>
          </div>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Error: Unable to fetch integration.</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <ConfirmationAlertDialog
        isOpen={popUp.deleteConfirmation.isOpen}
        title={`Are you sure you want to remove ${integration?.integration || " "} integration for ${
          integration?.app || "this project"
        }?`}
        description="This action is irreversible."
        onOpenChange={(isOpen) => handlePopUpToggle("deleteConfirmation", isOpen)}
        confirmKey={
          (integration?.integration === "azure-app-configuration" &&
            integration?.app?.split("//")[1]?.split(".")[0]) ||
          integration?.app ||
          integration?.owner ||
          integration?.path ||
          integration?.integration ||
          ""
        }
        onConfirm={async () => {
          if (shouldDeleteSecrets) {
            handlePopUpOpen("deleteSecretsConfirmation");
            return;
          }

          await handleIntegrationDelete(false);

          handlePopUpClose("deleteConfirmation");
        }}
      >
        {integration?.integration === "github" && (
          <Field orientation="horizontal">
            <Checkbox
              id="delete-integration-secrets"
              variant="danger"
              isChecked={shouldDeleteSecrets}
              onCheckedChange={() => setShouldDeleteSecrets.toggle()}
            />
            <FieldLabel htmlFor="delete-integration-secrets">
              Delete previously synced secrets from the destination
            </FieldLabel>
          </Field>
        )}
      </ConfirmationAlertDialog>
      <ConfirmationAlertDialog
        isOpen={popUp.deleteSecretsConfirmation.isOpen}
        title={`Are you sure you also want to delete secrets on ${integration?.integration}?`}
        description="By confirming, you acknowledge that all secrets managed by this integration will be removed from the destination. This action is irreversible."
        onOpenChange={(isOpen) => handlePopUpToggle("deleteSecretsConfirmation", isOpen)}
        confirmKey="confirm"
        onConfirm={async () => {
          await handleIntegrationDelete(true);
          handlePopUpClose("deleteSecretsConfirmation");
          handlePopUpClose("deleteConfirmation");
        }}
      />
    </>
  );
};
