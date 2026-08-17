import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogConfirmationLabel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Field,
  Input
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { useDeleteServiceToken } from "@app/hooks/api";

import { AddServiceTokenModal } from "./AddServiceTokenModal";
import { ServiceTokenTable } from "./ServiceTokenTable";

type DeleteModalData = { name: string; id: string };

export const ServiceTokenSection = withProjectPermission(
  () => {
    const { t } = useTranslation();

    const deleteServiceToken = useDeleteServiceToken();
    const [deleteConfirmation, setDeleteConfirmation] = useState("");

    const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
      "createAPIToken",
      "deleteAPITokenConfirmation"
    ] as const);

    const deleteModalData = popUp.deleteAPITokenConfirmation.data as DeleteModalData | undefined;
    const deleteConfirmationText = deleteModalData?.name.trim() || "service token";
    const isDeleteConfirmed =
      Boolean(deleteModalData) && deleteConfirmation === deleteConfirmationText;

    const onDeleteApproved = async () => {
      if (!deleteModalData?.id) return;

      try {
        await deleteServiceToken.mutateAsync(deleteModalData.id);
        createNotification({
          text: "Successfully deleted service token",
          type: "success"
        });

        setDeleteConfirmation("");
        handlePopUpClose("deleteAPITokenConfirmation");
      } catch {
        // MutationCache reports request errors globally; keep the dialog available for another attempt.
      }
    };

    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle>
              Service Tokens
              <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/token" />
            </CardTitle>
            <CardDescription>{t("section.token.service-tokens-description")}</CardDescription>
            <CardAction>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Create}
                a={ProjectPermissionSub.ServiceTokens}
              >
                {(isAllowed) => (
                  <Button
                    variant="project"
                    onClick={() => {
                      handlePopUpOpen("createAPIToken");
                    }}
                    isDisabled={!isAllowed}
                  >
                    <PlusIcon />
                    Create Token
                  </Button>
                )}
              </ProjectPermissionCan>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ServiceTokenTable handlePopUpOpen={handlePopUpOpen} />
          </CardContent>
        </Card>
        <AddServiceTokenModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
        <AlertDialog
          open={popUp.deleteAPITokenConfirmation.isOpen}
          onOpenChange={(isOpen) => {
            if (deleteServiceToken.isPending) return;
            if (!isOpen) setDeleteConfirmation("");
            handlePopUpToggle("deleteAPITokenConfirmation", isOpen);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete token?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <Alert variant="danger" appearance="borderless">
                  <AlertDescription>
                    This permanently revokes the service token and cannot be undone.
                  </AlertDescription>
                </Alert>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogConfirmationField>
              <Field>
                <AlertDialogConfirmationLabel
                  htmlFor="delete-service-token-confirmation"
                  confirmationValue={deleteConfirmationText}
                />
                <Input
                  id="delete-service-token-confirmation"
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  placeholder={deleteConfirmationText}
                  autoComplete="off"
                  autoFocus
                />
              </Field>
            </AlertDialogConfirmationField>
            <AlertDialogFooter>
              <AlertDialogCancel isDisabled={deleteServiceToken.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                variant="danger"
                isPending={deleteServiceToken.isPending}
                isDisabled={!isDeleteConfirmed}
                onClick={(event) => {
                  event.preventDefault();
                  onDeleteApproved();
                }}
              >
                Delete Token
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.ServiceTokens }
);
