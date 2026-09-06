import { useState } from "react";
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
  DocumentationLinkBadge,
  SelectedActionBar
} from "@app/components/v3";
import { useBulkDeleteSharedSecrets, useDeleteSharedSecret } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AddShareSecretModal } from "./AddShareSecretModal";
import { EditShareSecretModal } from "./EditShareSecretModal";
import { ShareSecretsTable } from "./ShareSecretsTable";

type DeleteModalData = { name: string; id: string };

export const ShareSecretTab = () => {
  const { popUp, handlePopUpToggle, handlePopUpClose, handlePopUpOpen } = usePopUp([
    "createSharedSecret",
    "editSharedSecret",
    "deleteSharedSecretConfirmation"
  ] as const);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const deleteSecretShare = useDeleteSharedSecret();
  const bulkDeleteSecretShares = useBulkDeleteSharedSecrets();

  const onBulkDelete = async () => {
    try {
      await bulkDeleteSecretShares.mutateAsync({ sharedSecretIds: selectedIds });

      createNotification({
        text: `Successfully deleted ${selectedIds.length} shared secrets`,
        type: "success"
      });

      setSelectedIds([]);
    } catch {
      createNotification({
        text: "Failed to delete shared secrets",
        type: "error"
      });
    }
  };

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
    <>
      <SelectedActionBar
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
      >
        <Button
          variant="danger"
          size="xs"
          onClick={onBulkDelete}
          isPending={bulkDeleteSecretShares.isPending}
        >
          <Trash2 className="mr-1 size-4" />
          Delete
        </Button>
      </SelectedActionBar>
      <Card>
      <CardHeader>
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
      <CardContent>
        <ShareSecretsTable
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          handlePopUpOpen={handlePopUpOpen}
        />
      </CardContent>
      <AddShareSecretModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <EditShareSecretModal
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
        handlePopUpClose={handlePopUpClose}
      />
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
    </>
  );
};
