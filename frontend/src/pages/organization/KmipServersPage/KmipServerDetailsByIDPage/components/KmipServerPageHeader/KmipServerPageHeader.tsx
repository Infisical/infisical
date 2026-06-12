import { useNavigate } from "@tanstack/react-router";
import { BanIcon, CopyIcon, EllipsisIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, PageHeader } from "@app/components/v2";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v3";
import {
  OrgKmipServerPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useDeleteKmipServerById, useRevokeKmipServerAccess } from "@app/hooks/api/kmipServers";
import { TKmipServerWithAuthMethod } from "@app/hooks/api/kmipServers/types";

export const KmipServerPageHeader = ({
  kmipServer,
  orgId
}: {
  kmipServer: TKmipServerWithAuthMethod;
  orgId: string;
}) => {
  const navigate = useNavigate();
  const { mutateAsync: deleteKmipServer } = useDeleteKmipServerById();
  const { mutateAsync: revokeKmipServer } = useRevokeKmipServerAccess();
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

      <DeleteActionModal
        isOpen={popUp.deleteKmipServer.isOpen}
        title={`Delete KMIP server "${kmipServer.name}"?`}
        onChange={(isOpen) => handlePopUpToggle("deleteKmipServer", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={onDelete}
      />
      <DeleteActionModal
        isOpen={popUp.revokeKmipServer.isOpen}
        title={`Revoke access for KMIP server "${kmipServer.name}"?`}
        subTitle="The KMIP server will be disconnected and any active tokens will be invalidated. The server will need to re-authenticate to reconnect."
        onChange={(isOpen) => handlePopUpToggle("revokeKmipServer", isOpen)}
        deleteKey="confirm"
        buttonText="Revoke access"
        onDeleteApproved={onRevoke}
      />
    </>
  );
};
