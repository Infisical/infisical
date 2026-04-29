import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  BanIcon,
  CheckIcon,
  ClipboardListIcon,
  CopyIcon,
  EllipsisIcon,
  HeartPulseIcon,
  PencilIcon,
  TrashIcon,
  TriangleAlertIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, PageHeader, Tooltip } from "@app/components/v2";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Separator
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { usePopUp, useTimedReset } from "@app/hooks";
import {
  useDeleteGatewayV2ById,
  useRevokeGatewayAccess,
  useTriggerGatewayV2Heartbeat
} from "@app/hooks/api/gateways-v2";
import {
  GatewayAuthMethodView,
  GatewayHealthCheckStatus,
  TGatewayV2,
  TGatewayV2WithAuthMethod
} from "@app/hooks/api/gateways-v2/types";

import { GatewayAuthMethodModal } from "../GatewayAuthMethod/GatewayAuthMethodModal";
import { ViewGatewayAuth } from "../GatewayAuthMethod/ViewGatewayAuth";

const HealthBadge = ({ gateway }: { gateway: TGatewayV2 }) => {
  if (!gateway.heartbeat && !gateway.lastHealthCheckStatus) {
    return <Badge variant="warning">Unregistered</Badge>;
  }
  if (gateway.lastHealthCheckStatus === GatewayHealthCheckStatus.Healthy) {
    return <Badge variant="success">Healthy</Badge>;
  }
  return <Badge variant="danger">Unreachable</Badge>;
};

const AuthMethodBadge = ({ method }: { method: GatewayAuthMethodView["method"] }) => {
  if (method === "aws") return <Badge variant="info">AWS Auth</Badge>;
  if (method === "token") return <Badge variant="info">Token Auth</Badge>;
  return <Badge variant="warning">Machine Identity</Badge>;
};

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
  // tokenVersion > 0 ⇒ this gateway has had a JWT minted at some point — revoke is meaningful.
  const canRevoke = gateway.tokenVersion > 0;

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

export const GatewayDetailsCard = ({ gateway }: { gateway: TGatewayV2WithAuthMethod }) => {
  const [, isCopyingId, setCopyTextId] = useTimedReset<string>({
    initialState: "Copy ID to clipboard"
  });
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { authMethod } = gateway;
  const isIdentityGateway = authMethod.method === "identity";

  return (
    <>
      <Card className="w-full">
        <CardHeader className="border-b">
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGroup>
            <DetailGroupHeader>General</DetailGroupHeader>
            <Detail>
              <DetailLabel>ID</DetailLabel>
              <DetailValue className="flex items-center gap-x-1">
                <span className="font-mono text-xs">{gateway.id}</span>
                <Tooltip content="Copy gateway ID to clipboard">
                  <IconButton
                    aria-label="copy gateway id"
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
          <Separator className="my-4" />
          <DetailGroup>
            <DetailGroupHeader className="flex items-center justify-between">
              Authentication
              {!isIdentityGateway && (
                <OrgPermissionCan
                  I={OrgGatewayPermissionActions.EditGateways}
                  a={OrgPermissionSubjects.Gateway}
                >
                  {(isAllowed) => (
                    <IconButton
                      size="xs"
                      variant="ghost-muted"
                      aria-label="edit auth method"
                      isDisabled={!isAllowed}
                      onClick={() => setAuthModalOpen(true)}
                    >
                      <PencilIcon />
                    </IconButton>
                  )}
                </OrgPermissionCan>
              )}
            </DetailGroupHeader>
            {isIdentityGateway && (
              <Alert variant="warning">
                <TriangleAlertIcon />
                <AlertTitle>Authenticated via Machine Identity (Legacy)</AlertTitle>
                <AlertDescription>
                  <p>
                    This gateway is still using machine identity. We recommend creating a new
                    gateway.
                  </p>
                  <Link
                    to="/organizations/$orgId/networking"
                    params={{ orgId }}
                    search={{ selectedTab: "gateways" }}
                    className="underline underline-offset-4"
                  >
                    Create a new gateway
                  </Link>
                </AlertDescription>
              </Alert>
            )}
            <Detail>
              <DetailLabel>Method</DetailLabel>
              <DetailValue>
                <AuthMethodBadge method={authMethod.method} />
              </DetailValue>
            </Detail>
            <ViewGatewayAuth authMethod={authMethod} />
          </DetailGroup>
        </CardContent>
      </Card>

      {!isIdentityGateway && (
        <GatewayAuthMethodModal
          isOpen={authModalOpen}
          onOpenChange={setAuthModalOpen}
          gatewayId={gateway.id}
          currentMethod={authMethod}
        />
      )}
    </>
  );
};
