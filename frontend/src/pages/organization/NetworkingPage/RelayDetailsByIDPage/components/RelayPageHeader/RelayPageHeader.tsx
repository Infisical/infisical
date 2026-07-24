import { useNavigate } from "@tanstack/react-router";
import { BanIcon, CopyIcon, EllipsisIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v3";
import {
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useDeleteRelayById, useRevokeRelayAccess } from "@app/hooks/api/relays";
import { TRelayWithAuthMethod } from "@app/hooks/api/relays/types";

export const RelayPageHeader = ({
  relay,
  orgId
}: {
  relay: TRelayWithAuthMethod;
  orgId: string;
}) => {
  const navigate = useNavigate();
  const { mutateAsync: deleteRelay, isPending: isDeleting } = useDeleteRelayById();
  const { mutateAsync: revokeRelay, isPending: isRevoking } = useRevokeRelayAccess();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "deleteRelay",
    "revokeRelay"
  ] as const);

  const onDelete = async () => {
    await deleteRelay(relay.id);
    createNotification({ type: "success", text: "Successfully deleted relay" });
    navigate({
      to: "/organizations/$orgId/networking",
      params: { orgId },
      search: { selectedTab: "relays" }
    });
  };

  const onRevoke = async () => {
    try {
      await revokeRelay({ relayId: relay.id });
      createNotification({ type: "success", text: "Relay access revoked" });
      handlePopUpToggle("revokeRelay", false);
    } catch {
      createNotification({ type: "error", text: "Failed to revoke relay access" });
    }
  };

  const { canRevoke } = relay;

  return (
    <>
      <PageHeader
        scope="org"
        title={relay.name}
        description="Relay configuration and authentication"
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
                navigator.clipboard.writeText(relay.id);
                createNotification({ type: "info", text: "Relay ID copied to clipboard" });
              }}
            >
              <CopyIcon />
              Copy Relay ID
            </DropdownMenuItem>
            {canRevoke && (
              <OrgPermissionCan
                I={OrgRelayPermissionActions.RevokeRelayAccess}
                a={OrgPermissionSubjects.Relay}
              >
                {(isAllowed) => (
                  <DropdownMenuItem
                    variant="danger"
                    isDisabled={!isAllowed}
                    onClick={() => handlePopUpOpen("revokeRelay")}
                  >
                    <BanIcon />
                    Revoke Access
                  </DropdownMenuItem>
                )}
              </OrgPermissionCan>
            )}
            <OrgPermissionCan
              I={OrgRelayPermissionActions.DeleteRelays}
              a={OrgPermissionSubjects.Relay}
            >
              {(isAllowed) => (
                <DropdownMenuItem
                  variant="danger"
                  isDisabled={!isAllowed}
                  onClick={() => handlePopUpOpen("deleteRelay")}
                >
                  <TrashIcon />
                  Delete Relay
                </DropdownMenuItem>
              )}
            </OrgPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      <AlertDialog
        open={popUp.deleteRelay.isOpen}
        onOpenChange={(open) => handlePopUpToggle("deleteRelay", open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {relay.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the relay from your organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" isPending={isDeleting} onClick={onDelete}>
              Delete Relay
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={popUp.revokeRelay.isOpen}
        onOpenChange={(open) => handlePopUpToggle("revokeRelay", open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke access for {relay.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The relay will be disconnected and active tokens invalidated. It must re-authenticate
              to reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" isPending={isRevoking} onClick={onRevoke}>
              Revoke Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
