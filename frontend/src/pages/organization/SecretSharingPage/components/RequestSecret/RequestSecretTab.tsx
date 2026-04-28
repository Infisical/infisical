import { ReplyIcon, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge
} from "@app/components/v3";
import { useDeleteSecretRequest } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddSecretRequestModal } from "./AddSecretRequestModal";
import { RequestedSecretsTable } from "./RequestedSecretsTable";
import { RevealSecretValueModal } from "./RevealSecretValueModal";

export const RequestSecretTab = () => {
  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "createSecretRequest",
    "deleteSecretRequestConfirmation",
    "revealSecretRequestValue"
  ] as const);

  const { mutateAsync: deleteSecretRequest } = useDeleteSecretRequest();

  const onDeleteApproved = async () => {
    await deleteSecretRequest({
      secretRequestId: popUp.deleteSecretRequestConfirmation.data?.id
    });
    createNotification({
      text: "Successfully deleted secret request",
      type: "success"
    });

    handlePopUpClose("deleteSecretRequestConfirmation");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Secret Requests
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-sharing" />
        </CardTitle>
        <CardDescription>Request and manage secrets from your team</CardDescription>
        <CardAction>
          <Button
            variant="org"
            onClick={() => {
              handlePopUpOpen("createSecretRequest");
            }}
          >
            <ReplyIcon />
            Request Secret
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <RequestedSecretsTable handlePopUpOpen={handlePopUpOpen} />
      </CardContent>
      <AddSecretRequestModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <RevealSecretValueModal
        isOpen={popUp.revealSecretRequestValue.isOpen}
        popUp={popUp}
        onOpenChange={(isOpen) => handlePopUpToggle("revealSecretRequestValue", isOpen)}
      />
      <AlertDialog
        open={popUp.deleteSecretRequestConfirmation.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteSecretRequestConfirmation", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete secret request?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The secret request link will no longer be accessible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={onDeleteApproved}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
