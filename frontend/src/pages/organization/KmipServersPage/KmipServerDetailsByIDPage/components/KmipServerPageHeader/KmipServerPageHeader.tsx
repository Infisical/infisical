import { useNavigate } from "@tanstack/react-router";
import { BanIcon, CopyIcon, EllipsisIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  DeleteConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PageHeader
} from "@app/components/v3";
import {
  OrgKmipServerPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useDeleteKmipServerById, useRevokeKmipServerAccess } from "@app/hooks/api/kmipServers";
import { TKmipServerWithAuthMethod } from "@app/hooks/api/kmipServers/types";

export const KmipServerPageHeader = ({ kmipServer, orgId }: Props) => {
  const navigate = useNavigate();
  const { mutateAsync: deleteKmipServer, isPending: isDeleting } = useDeleteKmipServerById();
  const { mutateAsync: revokeKmipServer, isPending: isRevoking } = useRevokeKmipServerAccess();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "deleteKmipServer",
    "revokeKmipServer"
  ] as const);

  const onDelete = async () => {
    await deleteKmipServer(kmipServer.id);
    createNotification({ type: "success", text: "Successfully deleted KMIP server" });
    navigate({
      to: "/organizations/$orgId/projects/kms/kmip-servers",
      params: { orgId }
    });
  };

  const onRevoke = async () => {
    try {
      await revokeKmipServer({ kmipServerId: kmipServer.id });
      createNotification({ type: "success", text: "KMIP server access revoked" });
      handlePopUpToggle("revokeKmipServer", false);
    } catch {
      createNotification({ type: "error", text: "Failed to revoke KMIP server access" });
    }
  };

  const { canRevoke } = kmipServer;

  return (
    <>
      <PageHeader
        scope="org"
        title={kmipServer.name}
        description="KMIP server configuration and authentication"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              Options
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                navigator.clipboard.writeText(kmipServer.id);
                createNotification({ type: "info", text: "KMIP server ID copied to clipboard" });
              }}
            >
              <CopyIcon />
              Copy KMIP Server ID
            </DropdownMenuItem>
            {canRevoke && (
              <OrgPermissionCan
                I={OrgKmipServerPermissionActions.RevokeKmipServerAccess}
                a={OrgPermissionSubjects.KmipServer}
              >
                {(isAllowed) => (
                  <DropdownMenuItem
                    variant="danger"
                    isDisabled={!isAllowed}
                    onClick={() => handlePopUpOpen("revokeKmipServer")}
                  >
                    <BanIcon />
                    Revoke Access
                  </DropdownMenuItem>
                )}
              </OrgPermissionCan>
            )}
            <OrgPermissionCan
              I={OrgKmipServerPermissionActions.DeleteKmipServers}
              a={OrgPermissionSubjects.KmipServer}
            >
              {(isAllowed) => (
                <DropdownMenuItem
                  variant="danger"
                  isDisabled={!isAllowed}
                  onClick={() => handlePopUpOpen("deleteKmipServer")}
                >
                  <TrashIcon />
                  Delete KMIP Server
                </DropdownMenuItem>
              )}
            </OrgPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      <DeleteConfirmDialog
        isOpen={popUp.deleteKmipServer.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteKmipServer", isOpen)}
        title={`Delete KMIP Server ${kmipServer.name}?`}
        description={
          <Alert variant="danger" appearance="borderless">
            <AlertDescription>
              This permanently removes the KMIP server {kmipServer.name} from your organization.
              Deployed instances lose access and KMIP clients can no longer reach it. This cannot be
              undone.
            </AlertDescription>
          </Alert>
        }
        confirmKey={kmipServer.name}
        confirmLabel="Delete KMIP Server"
        isPending={isDeleting}
        onConfirm={onDelete}
      />
      <AlertDialog
        open={popUp.revokeKmipServer.isOpen}
        onOpenChange={(open) => handlePopUpToggle("revokeKmipServer", open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Access for KMIP Server {kmipServer.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The KMIP server is disconnected and its active tokens are invalidated. It must
              re-authenticate to reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isRevoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isRevoking}
              onClick={(event) => {
                event.preventDefault();
                onRevoke();
              }}
            >
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

type Props = {
  kmipServer: TKmipServerWithAuthMethod;
  orgId: string;
};
