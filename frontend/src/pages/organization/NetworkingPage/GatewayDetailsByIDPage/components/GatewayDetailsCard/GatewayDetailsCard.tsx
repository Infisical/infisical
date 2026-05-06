import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { CheckIcon, ClipboardListIcon, PencilIcon, TriangleAlertIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import { Tooltip } from "@app/components/v2";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue,
  IconButton,
  Separator
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useTimedReset } from "@app/hooks";
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
                  <span className="text-muted">—</span>
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
            {!isIdentityGateway && (
              <Detail>
                <DetailLabel>Method</DetailLabel>
                <DetailValue>
                  <AuthMethodBadge method={authMethod.method} />
                </DetailValue>
              </Detail>
            )}
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
