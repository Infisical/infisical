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
  const deleteSecret = popUp?.deleteSharedSecretConfirmation?.data as DeleteModalData | undefined;

  const onDeleteApproved = async () => {
    if (!deleteSecret?.id) return;

    await deleteSecretShare.mutateAsync({ sharedSecretId: deleteSecret?.id });
    createNotification({ text: "Shared secret deleted", type: "success" });

    handlePopUpClose("deleteSharedSecretConfirmation");
  };

  return (
    <Card className="gap-0">
      <CardHeader className="border-b">
        <CardTitle>
          Shared Secrets
          <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-sharing" />
        </CardTitle>
        <CardDescription>Manage and view your shared secrets</CardDescription>
        <CardAction>
          <Button
            variant="project"
            onClick={() => {
              handlePopUpOpen("createSharedSecret");
            }}
          >
            <ForwardIcon />
            Share Secret
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="pt-5">
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
            <AlertDialogTitle>
              Delete {deleteSecret?.name ? `"${deleteSecret.name}"` : "shared secret"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The shared secret link will no longer be accessible. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={onDeleteApproved}
              isPending={deleteSecretShare.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
