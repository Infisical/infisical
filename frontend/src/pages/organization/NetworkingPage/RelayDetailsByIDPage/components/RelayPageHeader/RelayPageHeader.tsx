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
  const { mutateAsync: deleteRelay } = useDeleteRelayById();
  const { mutateAsync: revokeRelay } = useRevokeRelayAccess();
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

      <DeleteActionModal
        isOpen={popUp.deleteRelay.isOpen}
        title={`Delete relay "${relay.name}"?`}
        onChange={(isOpen) => handlePopUpToggle("deleteRelay", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={onDelete}
      />
      <DeleteActionModal
        isOpen={popUp.revokeRelay.isOpen}
        title={`Revoke access for relay "${relay.name}"?`}
        subTitle="The relay will be disconnected and any active tokens will be invalidated. The relay will need to re-authenticate to reconnect."
        onChange={(isOpen) => handlePopUpToggle("revokeRelay", isOpen)}
        deleteKey="confirm"
        buttonText="Revoke access"
        onDeleteApproved={onRevoke}
      />
    </>
  );
};
