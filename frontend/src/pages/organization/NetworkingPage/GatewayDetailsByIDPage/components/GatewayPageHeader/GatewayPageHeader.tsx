import { useNavigate } from "@tanstack/react-router";
import { BanIcon, CopyIcon, EllipsisIcon, HeartPulseIcon, TrashIcon } from "lucide-react";

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
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { usePopUp } from "@app/hooks";
import {
  useDeleteGatewayV2ById,
  useRevokeGatewayAccess,
  useTriggerGatewayV2Heartbeat
} from "@app/hooks/api/gateways-v2";
import { TGatewayV2 } from "@app/hooks/api/gateways-v2/types";

export const GatewayPageHeader = ({ gateway, orgId }: { gateway: TGatewayV2; orgId: string }) => {
  const navigate = useNavigate();
  const { mutateAsync: deleteGateway } = useDeleteGatewayV2ById();
  const { mutateAsync: revokeGateway } = useRevokeGatewayAccess();
  const { mutateAsync: triggerHeartbeat, isPending: isHeartbeating } =
    useTriggerGatewayV2Heartbeat();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "deleteGateway",
    "revokeGateway"
  ] as const);

  const onDelete = async () => {
    await deleteGateway(gateway.id);
    createNotification({ type: "success", text: "Successfully deleted gateway" });
    navigate({ to: "/organizations/$orgId/networking", params: { orgId } });
  };

  const onRevoke = async () => {
    try {
      await revokeGateway({ gatewayId: gateway.id });
      createNotification({ type: "success", text: "Gateway access revoked" });
      handlePopUpToggle("revokeGateway", false);
    } catch {
      createNotification({ type: "error", text: "Failed to revoke gateway access" });
    }
  };

  const onHeartbeat = async () => {
    try {
      await triggerHeartbeat(gateway.id);
      createNotification({ type: "success", text: "Health check successful — gateway is healthy" });
    } catch {
      createNotification({ type: "error", text: "Health check failed — gateway is unreachable" });
    }
  };

  const isRegistered = Boolean(gateway.heartbeat || gateway.lastHealthCheckStatus);
  const { canRevoke } = gateway;

  return (
    <>
      <PageHeader
        scope="org"
        title={gateway.name}
        description="Gateway configuration and authentication"
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
                navigator.clipboard.writeText(gateway.id);
                createNotification({ type: "info", text: "Gateway ID copied to clipboard" });
              }}
            >
              <CopyIcon />
              Copy Gateway ID
            </DropdownMenuItem>
            {isRegistered && (
              <DropdownMenuItem isDisabled={isHeartbeating} onClick={onHeartbeat}>
                <HeartPulseIcon />
                Trigger Health Check
              </DropdownMenuItem>
            )}
            {canRevoke && (
              <OrgPermissionCan
                I={OrgGatewayPermissionActions.RevokeGatewayAccess}
                a={OrgPermissionSubjects.Gateway}
              >
                {(isAllowed) => (
                  <DropdownMenuItem
                    variant="danger"
                    isDisabled={!isAllowed}
                    onClick={() => handlePopUpOpen("revokeGateway")}
                  >
                    <BanIcon />
                    Revoke Access
                  </DropdownMenuItem>
                )}
              </OrgPermissionCan>
            )}
            <OrgPermissionCan
              I={OrgGatewayPermissionActions.DeleteGateways}
              a={OrgPermissionSubjects.Gateway}
            >
              {(isAllowed) => (
                <DropdownMenuItem
                  variant="danger"
                  isDisabled={!isAllowed}
                  onClick={() => handlePopUpOpen("deleteGateway")}
                >
                  <TrashIcon />
                  Delete Gateway
                </DropdownMenuItem>
              )}
            </OrgPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      <DeleteActionModal
        isOpen={popUp.deleteGateway.isOpen}
        title={`Delete gateway "${gateway.name}"?`}
        onChange={(isOpen) => handlePopUpToggle("deleteGateway", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={onDelete}
      />
      <DeleteActionModal
        isOpen={popUp.revokeGateway.isOpen}
        title={`Revoke access for gateway "${gateway.name}"?`}
        subTitle="The gateway will be disconnected and any active tokens will be invalidated. The gateway will need to re-authenticate to reconnect."
        onChange={(isOpen) => handlePopUpToggle("revokeGateway", isOpen)}
        deleteKey="confirm"
        buttonText="Revoke access"
        onDeleteApproved={onRevoke}
      />
    </>
  );
};
