import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BanIcon, CopyIcon, EllipsisIcon, HeartPulseIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  FieldLabel,
  Input
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
  const { mutateAsync: deleteGateway, isPending: isDeleting } = useDeleteGatewayV2ById();
  const { mutateAsync: revokeGateway, isPending: isRevoking } = useRevokeGatewayAccess();
  const { mutateAsync: triggerHeartbeat, isPending: isHeartbeating } =
    useTriggerGatewayV2Heartbeat();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "deleteGateway",
    "revokeGateway"
  ] as const);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  const onDelete = async () => {
    try {
      await deleteGateway(gateway.id);
      createNotification({ type: "success", text: "Successfully deleted gateway" });
      navigate({ to: "/organizations/$orgId/networking", params: { orgId } });
    } catch {
      createNotification({ type: "error", text: "Failed to delete gateway" });
    }
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

  const isRegistered = Boolean(gateway.heartbeat || gateway.heartbeatTTL);
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

      <AlertDialog
        open={popUp.deleteGateway.isOpen}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmation("");
          handlePopUpToggle("deleteGateway", open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Gateway?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the gateway from your organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogConfirmationField>
            <Field>
              <FieldLabel htmlFor="delete-gateway-confirmation" size="sm">
                <span>
                  Type &quot;<span className="text-foreground">{gateway.name}</span>&quot; to
                  confirm.
                </span>
              </FieldLabel>
              <Input
                id="delete-gateway-confirmation"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                placeholder={gateway.name}
                autoComplete="off"
                autoFocus
              />
            </Field>
          </AlertDialogConfirmationField>
          <Alert variant="danger" appearance="borderless">
            <AlertDescription>Deleting this gateway cannot be undone.</AlertDescription>
          </Alert>
          <AlertDialogFooter>
            <AlertDialogCancel isDisabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isPending={isDeleting}
              isDisabled={deleteConfirmation !== gateway.name}
              onClick={(event) => {
                event.preventDefault();
                onDelete();
              }}
            >
              Delete Gateway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={popUp.revokeGateway.isOpen}
        onOpenChange={(open) => handlePopUpToggle("revokeGateway", open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Gateway Access?</AlertDialogTitle>
            <AlertDialogDescription>
              The gateway will be disconnected and active tokens invalidated. It must
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
