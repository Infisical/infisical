import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { CheckIcon, ClipboardListIcon, EllipsisIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, PageHeader, Tooltip } from "@app/components/v2";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton
} from "@app/components/v3";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { usePopUp, useTimedReset } from "@app/hooks";
import { useDeleteGatewayV2ById, useTriggerGatewayV2Heartbeat } from "@app/hooks/api/gateways-v2";
import { GatewayHealthCheckStatus, TGatewayV2 } from "@app/hooks/api/gateways-v2/types";

const HealthBadge = ({ gateway }: { gateway: TGatewayV2 }) => {
  if (!gateway.heartbeat && !gateway.lastHealthCheckStatus) {
    return <Badge variant="warning">Unregistered</Badge>;
  }
  if (gateway.lastHealthCheckStatus === GatewayHealthCheckStatus.Healthy) {
    return <Badge variant="success">Healthy</Badge>;
  }
  return <Badge variant="danger">Unreachable</Badge>;
};

export const GatewayPageHeader = ({ gateway, orgId }: { gateway: TGatewayV2; orgId: string }) => {
  const navigate = useNavigate();
  const { mutateAsync: deleteGateway } = useDeleteGatewayV2ById();
  const { mutateAsync: triggerHeartbeat, isPending: isHeartbeating } =
    useTriggerGatewayV2Heartbeat();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["deleteGateway"] as const);

  const onDelete = async () => {
    await deleteGateway(gateway.id);
    createNotification({ type: "success", text: "Successfully deleted gateway" });
    navigate({ to: "/organizations/$orgId/networking", params: { orgId } });
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
              Copy Gateway ID
            </DropdownMenuItem>
            {isRegistered && (
              <DropdownMenuItem isDisabled={isHeartbeating} onClick={onHeartbeat}>
                Trigger Health Check
              </DropdownMenuItem>
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
    </>
  );
};

export const GatewayDetailsCard = ({ gateway }: { gateway: TGatewayV2 }) => {
  const [, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });

  return (
    <Card className="w-full lg:max-w-[24rem]">
      <CardHeader className="border-b">
        <CardTitle>Details</CardTitle>
        <CardDescription>Gateway details</CardDescription>
      </CardHeader>
      <CardContent>
        <DetailGroup>
          <Detail>
            <DetailLabel>ID</DetailLabel>
            <DetailValue className="flex items-center gap-x-1">
              <span className="font-mono text-xs">{gateway.id}</span>
              <Tooltip content="Copy gateway ID to clipboard">
                <IconButton
                  onClick={() => {
                    navigator.clipboard.writeText(gateway.id);
                    setCopyTextId("Copied");
                  }}
                  variant="ghost"
                  size="xs"
                >
                  {isCopyingId ? <CheckIcon /> : <ClipboardListIcon className="text-label" />}
                </IconButton>
              </Tooltip>
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Health</DetailLabel>
            <DetailValue>
              <HealthBadge gateway={gateway} />
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Relay</DetailLabel>
            <DetailValue>
              {gateway.relay ? (
                gateway.relay.name
              ) : (
                <span className="text-muted">Auto-select on connect</span>
              )}
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Last Heartbeat</DetailLabel>
            <DetailValue>
              {gateway.heartbeat ? (
                format(new Date(gateway.heartbeat), "PPpp")
              ) : (
                <span className="text-muted">Never</span>
              )}
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Created</DetailLabel>
            <DetailValue>{format(new Date(gateway.createdAt), "PPpp")}</DetailValue>
          </Detail>
        </DetailGroup>
      </CardContent>
    </Card>
  );
};
