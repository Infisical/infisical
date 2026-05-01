import { ForwardIcon, Trash2 } from "lucide-react";

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
import { useDeleteSharedSecret } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddShareSecretModal } from "./AddShareSecretModal";
import { ShareSecretsTable } from "./ShareSecretsTable";

type DeleteModalData = { name: string; id: string };

export const ShareSecretTab = () => {
  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "createSharedSecret",
    "deleteSharedSecretConfirmation"
  ] as const);

  const deleteSecretShare = useDeleteSharedSecret();

  const onDeleteApproved = async () => {
    deleteSecretShare.mutateAsync({
      sharedSecretId: (popUp?.deleteSharedSecretConfirmation?.data as DeleteModalData)?.id
    });
    createNotification({
      text: "Successfully deleted shared secret",
      type: "success"
    });

    handlePopUpClose("deleteSharedSecretConfirmation");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Shared Secrets
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-sharing" />
        </CardTitle>
        <CardDescription>Manage and view your shared secrets</CardDescription>
        <CardAction>
          <Button
            variant="org"
            onClick={() => {
              handlePopUpOpen("createSharedSecret");
            }}
          >
            <ForwardIcon />
            Share Secret
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ShareSecretsTable handlePopUpOpen={handlePopUpOpen} />
      </CardContent>
      <AddShareSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <AlertDialog
        open={popUp.deleteSharedSecretConfirmation.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteSharedSecretConfirmation", isOpen)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete shared secret?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The shared secret link will no longer be accessible.
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
